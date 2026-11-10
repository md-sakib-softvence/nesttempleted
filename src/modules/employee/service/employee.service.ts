import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../../mail/mail.service';
import { CreateEmployeeDto } from '../dto/create-employee.dto';
import { UpdateEmployeeDto } from '../dto/update-employee.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import {
  buildPrismaQuery,
  calculatePaginationMeta,
  QueryOptions,
} from '../../utils/query.util';
import { getPreSignedUrl, deleteImageFromS3 } from '../../utils/s3.util';
import { generateEmployeeId } from '../utils/generate-id.util';
import { createActivities } from '../../utils/activity.util';
import { EmployeeRole, EmployeeState, NotificationStatus } from '@prisma/client';
import { CreateEmployeeTournamentAssignmentDto } from '../dto/create-employee-tournament-assignment.dto';
import { SendEmployeeMessageDto } from '../dto/send-employee-message.dto';
import { NotificationService } from '../../notification/notification.service';

@Injectable()
export class EmployeeService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
    private readonly notificationService: NotificationService,
  ) {}

  async sendEmployeeMessage(id: string, dto: SendEmployeeMessageDto) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        OR: [{ employeeId: id }, { showEmployeeId: id }],
        isDeleted: false,
        state: EmployeeState.ACTIVE,
      },
      select: { employeeId: true, name: true, role: true },
    });

    if (!employee) {
      throw new NotFoundException('Active staff member not found');
    }

    const message = dto.message.trim();
    if (!message) {
      throw new BadRequestException('Message cannot be empty');
    }

    const notification = await this.notificationService.create({
      status: NotificationStatus.INFORMATION,
      title: dto.title?.trim() || 'Message from Administration',
      description: message,
      userId: employee.employeeId,
    });

    return {
      notification,
      recipient: {
        employeeId: employee.employeeId,
        name: employee.name,
        role: employee.role,
      },
    };
  }

  async createEmployee(createEmployeeDto: CreateEmployeeDto) {
    const existingEmployee = await this.prisma.employee.findUnique({
      where: { email: createEmployeeDto.email },
    });

    if (existingEmployee) {
      if (existingEmployee.isDeleted) {
        const token = await this.jwtService.signAsync(
          { sub: existingEmployee.employeeId, email: existingEmployee.email },
          { expiresIn: '15m' },
        );
        // Using the same recovery link logic as admin
        await this.mailService.sendRecoveryLink(
          existingEmployee.email,
          token,
          existingEmployee.name,
        );
        throw new ConflictException(
          'This account has been deactivated. A recovery link has been sent to your email.',
        );
      }
      throw new ConflictException('Employee with this email already exists');
    }

    const { password, qrCode, ...rest } = createEmployeeDto;
    const initialQrCodes = [
      ...new Set(
        (Array.isArray(qrCode) ? qrCode : qrCode ? [qrCode] : [])
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    const hashedPassword = await bcrypt.hash(
      password,
      Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
    );
    const showEmployeeId = await generateEmployeeId(this.prisma);

    const newEmployee = await this.prisma.employee.create({
      data: {
        ...rest,
        qrCode: initialQrCodes,
        qrCodeSerials: initialQrCodes.map((_, index) => index + 1),
        qrCodeGenerationCount: initialQrCodes.length,
        password: hashedPassword,
        showEmployeeId,
        state: 'INACTIVE',
      },
    });

    const title = 'Employee Creation';
    const description = `Employee ${newEmployee.name} (${newEmployee.email}) was successfully created.`;
    await createActivities(this.prisma, title, description, 'EMPLOYEE');

    return newEmployee;
  }

  async updateEmployee(id: string, updateEmployeeDto: UpdateEmployeeDto) {
    // 1. Check if the employee exists by employeeId or showEmployeeId
    const existingEmployee = await this.prisma.employee.findFirst({
      where: {
        OR: [{ employeeId: id }, { showEmployeeId: id }],
      },
    });

    if (!existingEmployee) {
      throw new NotFoundException('Employee not found');
    }

    // 2. Check email uniqueness if email is being updated
    if (
      updateEmployeeDto.email &&
      updateEmployeeDto.email !== existingEmployee.email
    ) {
      const emailTaken = await this.prisma.employee.findUnique({
        where: { email: updateEmployeeDto.email },
      });
      if (emailTaken) {
        throw new ConflictException(
          'Email is already in use by another employee',
        );
      }
    }

    // 3. Prepare data safely without using 'any'
    const {
      password,
      deletedDocuments,
      document,
      deletedQrCodes,
      qrCode,
      profileImage,
      ...restData
    } = updateEmployeeDto;
    let hashedPassword: string | undefined = undefined;
    if (password) {
      hashedPassword = await bcrypt.hash(
        password,
        Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
      );
    }

    // Handle old profile image deletion if a new one is uploaded
    if (profileImage && existingEmployee.profileImage) {
      await deleteImageFromS3(existingEmployee.profileImage);
    }

    // Extract an S3 object key from a signed URL when deleting uploaded files.
    // Referral QR codes are regular URLs, so they must be matched as complete
    // strings and must never be sent to S3 for deletion.
    const extractS3Key = (urlOrKey: string) => {
      if (urlOrKey.startsWith('http')) {
        try {
          const url = new URL(urlOrKey);
          return url.pathname.substring(1);
        } catch {
          return urlOrKey;
        }
      }
      return urlOrKey;
    };
    const qrIdentity = (value: string) => {
      if (!value.startsWith('http://') && !value.startsWith('https://')) {
        return value;
      }
      try {
        const url = new URL(value);
        return url.hostname.endsWith('amazonaws.com')
          ? extractS3Key(value)
          : value;
      } catch {
        return value;
      }
    };

    let finalDocuments = existingEmployee.document || [];

    // Handle deleted documents
    if (deletedDocuments && deletedDocuments.length > 0) {
      const deletedKeys = deletedDocuments.map(extractS3Key);
      for (const key of deletedKeys) {
        await deleteImageFromS3(key);
      }
      finalDocuments = finalDocuments.filter(
        (doc) => !deletedKeys.includes(doc),
      );
    }

    // Append new documents
    if (document && document.length > 0) {
      finalDocuments = [...finalDocuments, ...document];
    }

    const storedQrCodes = existingEmployee.qrCode || [];
    const storedSerials = existingEmployee.qrCodeSerials || [];
    let qrCodeGenerationCount = existingEmployee.qrCodeGenerationCount || 0;
    const finalQrCodes: string[] = [];
    const finalQrCodeSerials: number[] = [];
    const seenQrCodes = new Set<string>();
    storedQrCodes.forEach((storedQr, index) => {
      if (seenQrCodes.has(storedQr)) return;
      seenQrCodes.add(storedQr);
      finalQrCodes.push(storedQr);
      finalQrCodeSerials.push(storedSerials[index] || index + 1);
    });
    qrCodeGenerationCount = Math.max(
      qrCodeGenerationCount,
      ...finalQrCodeSerials,
      0,
    );

    // Handle deleted QR codes
    if (deletedQrCodes && deletedQrCodes.length > 0) {
      const requestedDeletes = new Set(
        deletedQrCodes.map((qr) => qr.trim()).filter(Boolean),
      );
      const removedQrCodes = finalQrCodes.filter((storedQr) => {
        if (requestedDeletes.has(storedQr)) return true;

        // Uploaded QR images are stored as S3 keys, while the API may return
        // them as pre-signed URLs. Match those by key, but keep referral URLs
        // (which are stored as full URLs) on exact-match semantics.
        if (
          !storedQr.startsWith('http://') &&
          !storedQr.startsWith('https://')
        ) {
          return [...requestedDeletes].some((requestedQr) => {
            try {
              const requestedUrl = new URL(requestedQr);
              return (
                requestedUrl.hostname.endsWith('amazonaws.com') &&
                extractS3Key(requestedQr) === storedQr
              );
            } catch {
              return requestedQr === storedQr;
            }
          });
        }

        return false;
      });

      for (const qr of removedQrCodes) {
        if (!qr.startsWith('http://') && !qr.startsWith('https://')) {
          await deleteImageFromS3(qr);
        }
      }

      const remainingIndexes = finalQrCodes
        .map((qr, index) => ({ qr, index }))
        .filter(({ qr }) => !removedQrCodes.includes(qr));
      const remainingCodes = remainingIndexes.map(({ qr }) => qr);
      const remainingSerials = remainingIndexes.map(
        ({ index }) => finalQrCodeSerials[index],
      );
      finalQrCodes.splice(0, finalQrCodes.length, ...remainingCodes);
      finalQrCodeSerials.splice(0, finalQrCodeSerials.length, ...remainingSerials);
    }

    // Clients may submit the full current list. Add only genuinely new values.
    if (qrCode && qrCode.length > 0) {
      const incomingQrCodes = Array.isArray(qrCode) ? qrCode : [qrCode];
      for (const incomingQr of incomingQrCodes) {
        const normalizedQr = incomingQr.trim();
        if (
          !normalizedQr ||
          finalQrCodes.some((currentQr) => qrIdentity(currentQr) === qrIdentity(normalizedQr))
        ) continue;
        finalQrCodes.push(normalizedQr);
        qrCodeGenerationCount += 1;
        finalQrCodeSerials.push(qrCodeGenerationCount);
      }
    }

    // 4. Perform the update
    return this.prisma.employee.update({
      where: { employeeId: existingEmployee.employeeId },
      data: {
        ...restData,
        ...(profileImage ? { profileImage } : {}),
        document: finalDocuments,
        qrCode: finalQrCodes,
        qrCodeSerials: finalQrCodeSerials,
        qrCodeGenerationCount,
        ...(hashedPassword ? { password: hashedPassword } : {}),
      },
    });
  }

  async getEmployeeById(id: string) {
    if (!id) {
      throw new NotFoundException('Employee ID is required');
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        OR: [{ employeeId: id }, { showEmployeeId: id }],
      },
    });

    if (!employee || employee.isDeleted) {
      throw new NotFoundException('Employee not found');
    }

    if (employee.profileImage) {
      employee.profileImage = await getPreSignedUrl(employee.profileImage);
    }

    if (employee.document && employee.document.length > 0) {
      employee.document = await Promise.all(
        employee.document.map(async (doc) => getPreSignedUrl(doc)),
      );
    }

    if (employee.qrCode && employee.qrCode.length > 0) {
      employee.qrCode = await Promise.all(
        employee.qrCode.map(async (qr) => {
          if (qr.startsWith('http://') || qr.startsWith('https://')) {
            return qr;
          }
          return getPreSignedUrl(qr);
        }),
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...employeeWithoutPassword } = employee;
    const dynamicQrToken = `STAFF:${employee.role}:${employee.employeeId}:${employee.showEmployeeId}`;
    return {
      ...employeeWithoutPassword,
      qrToken: dynamicQrToken,
    };
  }

  async getPublicEmployeeById(id: string) {
    if (!id) throw new NotFoundException('Employee ID is required');

    const employee = await this.prisma.employee.findFirst({
      where: {
        OR: [{ employeeId: id }, { showEmployeeId: id }],
        isDeleted: false,
      },
      select: {
        employeeId: true,
        showEmployeeId: true,
        name: true,
        role: true,
        state: true,
        profileImage: true,
      },
    });

    if (!employee) throw new NotFoundException('Employee not found');
    return {
      ...employee,
      profileImage: employee.profileImage
        ? await getPreSignedUrl(employee.profileImage)
        : null,
    };
  }

  async getEmployeeByRole(id: string, role: EmployeeRole) {
    const employee = await this.getEmployeeById(id);
    if (employee.role !== role) {
      throw new NotFoundException(`${role.toLowerCase()} employee not found`);
    }
    return employee;
  }

  async getEmployeePass(id: string) {
    const employee = await this.getEmployeeById(id);
    const qrToken = `STAFF:${employee.role}:${employee.employeeId}:${employee.showEmployeeId}`;
    const passSerial = `PASS-${employee.showEmployeeId || employee.employeeId.slice(0, 8).toUpperCase()}`;
    return {
      ...employee,
      qrToken,
      passSerial,
      accessLevel:
        employee.role === 'SECURITY'
          ? 'Turnstile & Door Security Override'
          : employee.role === 'MANAGER'
            ? 'All-Access Venue & Operations Director'
            : 'Event Staff & Operations Access',
      department:
        employee.role === 'SECURITY'
          ? 'Arena Gate & Turnstile Security'
          : employee.role === 'MANAGER'
            ? 'Tournament Operations & Supervision'
            : 'Event Logistics & Umpire Desk',
      status: employee.state,
    };
  }

  async getEmployeeAnalytics(id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        OR: [{ employeeId: id }, { showEmployeeId: id }],
        isDeleted: false,
      },
      select: { employeeId: true, showEmployeeId: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const identities = [...new Set([employee.employeeId, employee.showEmployeeId])];
    const assignments = await this.prisma.tournamentStaffAssignment.findMany({
      where: { employeeId: employee.employeeId },
      select: { matchId: true, tournament: { select: { schedule: true } } },
    });
    const getScheduledMatches = (scheduleValue: unknown): any[] => {
      const schedule = scheduleValue as any;
      if (Array.isArray(schedule)) {
        return schedule.flatMap((venue: any) =>
          (venue?.screens || []).flatMap((screen: any) =>
            (screen?.days || []).flatMap((day: any) =>
              (day?.timeslots || [])
                .map((slot: any) => slot?.game)
                .filter((match: any) => match?.id),
            ),
          ),
        );
      }
      const matches = schedule?.structure?.matches || schedule?.matches;
      return Array.isArray(matches) ? matches : [];
    };
    const matchesOfficiated = assignments.filter((assignment) =>
      getScheduledMatches(assignment.tournament.schedule).some(
        (match) =>
          String(match.id) === assignment.matchId &&
          String(match.status || '').toUpperCase() === 'COMPLETED',
      ),
    ).length;

    const [totalScans, validScans, scannedTickets, disputesRaised] =
      await Promise.all([
        this.prisma.ticketScanLog.count({
          where: { guardId: { in: identities } },
        }),
        this.prisma.ticketScanLog.count({
          where: { guardId: { in: identities }, status: 'VALID' },
        }),
        this.prisma.ticketScanLog.findMany({
          where: {
            guardId: { in: identities },
            status: 'VALID',
            ticketId: { not: null },
          },
          distinct: ['ticketId'],
          select: { ticketId: true },
        }),
        this.prisma.matchDispute.count({
          where: {
            OR: [
              { reportedBy: { in: identities } },
              { resolvedBy: { in: identities } },
            ],
          },
        }),
      ]);

    return {
      employeeId: employee.employeeId,
      matchesOfficiated,
      playersScanned: scannedTickets.length,
      reliabilityScore:
        totalScans === 0 ? 0 : Math.round((validScans / totalScans) * 100),
      disputesRaised,
    };
  }

  async getMyTournamentStaffAssignments(employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { employeeId, isDeleted: false, state: 'ACTIVE' },
      select: { employeeId: true },
    });
    if (!employee) throw new NotFoundException('Active employee account not found');

    return this.prisma.tournamentStaffAssignment.findMany({
      where: { employeeId: employee.employeeId },
      include: {
        tournament: {
          select: {
            tournamentId: true,
            name: true,
            gameTitle: true,
            startDate: true,
            schedule: true,
          },
        },
      },
      orderBy: { assignedAt: 'asc' },
    });
  }

  async getEmployeeTournamentAssignments(employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { employeeId, isDeleted: false },
      select: { employeeId: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.prisma.employeeTournamentAssignment.findMany({
      where: { employeeId },
      include: {
        tournament: {
          select: {
            tournamentId: true,
            name: true,
            gameTitle: true,
            startDate: true,
          },
        },
        venue: { select: { venueId: true, name: true, address: true } },
        screen: { select: { screenId: true, screenName: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  async getMyTournamentVenueAssignments(employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { employeeId, isDeleted: false, state: 'ACTIVE' },
      select: { employeeId: true },
    });
    if (!employee) throw new NotFoundException('Active employee account not found');

    return this.prisma.employeeTournamentAssignment.findMany({
      where: { employeeId: employee.employeeId },
      include: {
        tournament: {
          select: {
            tournamentId: true,
            name: true,
            gameTitle: true,
            startDate: true,
          },
        },
        venue: { select: { venueId: true, name: true, address: true } },
        screen: { select: { screenId: true, screenName: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  async createEmployeeTournamentAssignment(
    employeeId: string,
    dto: CreateEmployeeTournamentAssignmentDto,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { employeeId, isDeleted: false },
      select: { employeeId: true, role: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    if (
      employee.role !== EmployeeRole.MANAGER &&
      employee.role !== EmployeeRole.AMBASSADOR
    ) {
      throw new BadRequestException(
        'Tournament venue assignments are available for managers and ambassadors',
      );
    }

    const tournament = await this.prisma.tournament.findFirst({
      where: { tournamentId: dto.tournamentId, isDeleted: false },
      include: { venues: { include: { screens: true } } },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    const venueId = dto.venueId?.trim() || null;
    const screenId = dto.screenId?.trim() || null;
    const venue = venueId
      ? tournament.venues.find((item) => item.venueId === venueId)
      : undefined;
    if (venueId) {
      if (!venue) {
        throw new BadRequestException('Selected venue does not belong to this tournament');
      }
    }
    if (screenId) {
      if (!venueId || !venue?.screens.some((screen) => screen.screenId === screenId)) {
        throw new BadRequestException('Selected screen must belong to the selected venue');
      }
    }

    const assignmentKey = [employeeId, dto.tournamentId, venueId || '*', screenId || '*'].join(':');
    return this.prisma.employeeTournamentAssignment.upsert({
      where: { assignmentKey },
      create: {
        assignmentKey,
        employeeId,
        tournamentId: dto.tournamentId,
        venueId,
        screenId,
      },
      update: {},
      include: {
        tournament: {
          select: { tournamentId: true, name: true, gameTitle: true, startDate: true },
        },
        venue: { select: { venueId: true, name: true, address: true } },
        screen: { select: { screenId: true, screenName: true } },
      },
    });
  }

  async removeEmployeeTournamentAssignment(
    employeeId: string,
    assignmentId: string,
  ) {
    const assignment = await this.prisma.employeeTournamentAssignment.findFirst({
      where: { id: assignmentId, employeeId },
      select: { id: true },
    });
    if (!assignment) throw new NotFoundException('Tournament assignment not found');
    await this.prisma.employeeTournamentAssignment.delete({
      where: { id: assignment.id },
    });
    return { employeeId, assignmentId, removed: true };
  }

  async getEmployeeMarketingData(id: string, query: QueryOptions = {}) {
    if (!id) {
      throw new NotFoundException('Employee ID is required');
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        OR: [{ employeeId: id }, { showEmployeeId: id }],
      },
    });

    if (!employee || employee.isDeleted) {
      throw new NotFoundException('Employee not found');
    }

    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      [
        'favoriteGameConsole',
        'favoriteFootballGame',
        'profession',
        'area',
        'parentName',
        'parentPhoneNumber',
        'registerAs',
        'gender',
        'occupation',
      ],
    );

    where.employeeId = id;

    if (query.isDeleted === 'all') {
      delete where.isDeleted;
    } else if (query.isDeleted !== undefined) {
      where.isDeleted = query.isDeleted === 'true' || query.isDeleted === true;
    } else {
      where.isDeleted = false;
    }

    const [data, total] = await Promise.all([
      this.prisma.marketingDataCollection.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          fan: {
            select: {
              fanId: true,
              showFanId: true,
              firstName: true,
              phoneNumber: true,
              email: true,
              gender: true,
              ageRange: true,
              status: true,
              coins: true,
              favoriteGame: true,
              profileImage: true,
              username: true,
              gamerTag: true,
              surname: true,
              isDeleted: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          player: {
            select: {
              playerId: true,
              showPlayerId: true,
              firstName: true,
              lastName: true,
              email: true,
              phoneNumber: true,
              username: true,
              gamerTag: true,
              surname: true,
              document: true,
              status: true,
              isDeleted: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      }),
      this.prisma.marketingDataCollection.count({ where }),
    ]);

    const safeData = await Promise.all(
      data.map(async (item) => {
        if (item.fan?.profileImage) {
          item.fan.profileImage = await getPreSignedUrl(item.fan.profileImage);
        }
        return item;
      }),
    );

    const meta = calculatePaginationMeta(total, page, limit);

    return { data: safeData, meta };
  }

  async getEmployeeDocuments(id: string) {
    if (!id) {
      throw new NotFoundException('Employee ID is required');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { employeeId: id },
      select: { document: true, isDeleted: true },
    });

    if (!employee || employee.isDeleted) {
      throw new NotFoundException('Employee not found');
    }

    if (employee.document && employee.document.length > 0) {
      return Promise.all(
        employee.document.map(async (doc) => getPreSignedUrl(doc)),
      );
    }

    return [];
  }

  async getAllEmployee(query: QueryOptions = {}) {
    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      ['name', 'email', 'showEmployeeId', 'phoneNumber'],
    );

    where.isDeleted = false;

    const [data, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip,
        take,
        orderBy,
      }),
      this.prisma.employee.count({ where }),
    ]);

    const safeData = await Promise.all(
      data.map(async (employee) => {
        if (employee.profileImage) {
          employee.profileImage = await getPreSignedUrl(employee.profileImage);
        }

        if (employee.document && employee.document.length > 0) {
          employee.document = await Promise.all(
            employee.document.map(async (doc) => getPreSignedUrl(doc)),
          );
        }

        if (employee.qrCode && employee.qrCode.length > 0) {
          employee.qrCode = await Promise.all(
            employee.qrCode.map(async (qr) => {
              if (qr.startsWith('http://') || qr.startsWith('https://')) {
                return qr;
              }
              return getPreSignedUrl(qr);
            }),
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...employeeWithoutPassword } = employee;
        return employeeWithoutPassword;
      }),
    );

    const meta = calculatePaginationMeta(total, page, limit);

    return { data: safeData, meta };
  }

  async deleteEmployee(id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        OR: [{ employeeId: id }, { showEmployeeId: id }],
      },
    });

    if (!employee || employee.isDeleted) {
      throw new NotFoundException('Employee not found or already deleted');
    }

    return this.prisma.employee.update({
      where: { employeeId: employee.employeeId },
      data: {
        isDeleted: true,
      },
    });
  }

  async recoverEmployee(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
      }>(token);
      const employee = await this.prisma.employee.findUnique({
        where: { employeeId: payload.sub },
      });

      if (!employee) {
        throw new NotFoundException('Employee not found');
      }

      if (!employee.isDeleted) {
        throw new ConflictException('Employee account is already active');
      }

      return await this.prisma.employee.update({
        where: { employeeId: employee.employeeId },
        data: { isDeleted: false },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired recovery link');
    }
  }
}
