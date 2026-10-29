import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTournamentRegistrationDto } from '../dto/tournament/create-registration.dto';
import { UpdateRegistrationStatusDto } from '../dto/tournament/update-registration-status.dto';
import { OpenRegistrationDto } from '../dto/tournament/open-registration.dto';
import {
  RegistrationSelectionDto,
  SelectionMode,
} from '../dto/tournament/registration-selection.dto';
import { QueryTournamentRegistrationDto } from '../dto/tournament/query-registration.dto';
import { TournamentRegistrationStatus, Prisma } from '@prisma/client';
import { uploadBase64ToS3 } from '../../utils/s3.util';

@Injectable()
export class TournamentRegistrationService {
  private readonly logger = new Logger(TournamentRegistrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registers a player for a tournament with full domain validation and edge case guards.
   */
  async createRegistration(
    tournamentId: string,
    dto: CreateTournamentRegistrationDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      include: { registrations: true },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException(
        `Tournament #${tournamentId} not found or has been deleted`,
      );
    }

    // 1. Guard against registration on closed or non-active tournaments
    if (!tournament.registrationOpen) {
      throw new BadRequestException(
        'Registration is closed for this tournament.',
      );
    }

    const nonRegistrableStatuses = ['COMPLETED', 'CANCELLED', 'ARCHIVED'];
    if (nonRegistrableStatuses.includes(tournament.status)) {
      throw new BadRequestException(
        `Cannot register for tournament in ${tournament.status} state.`,
      );
    }

    // 2. Validate mandatory Jersey Size if configured
    if (tournament.requireJerseySize && !dto.jerseySize?.trim()) {
      throw new BadRequestException(
        'Jersey/Shirt size is mandatory for this tournament registration.',
      );
    }

    // 3. Validate distinct primary and backup club selections
    if (
      dto.primaryTeamId &&
      dto.secondaryTeamId &&
      dto.primaryTeamId !== "individual-competitor" &&
      dto.primaryTeamId.trim() &&
      dto.primaryTeamId.trim() === dto.secondaryTeamId.trim()
    ) {
      throw new BadRequestException(
        'Primary club and secondary backup choice must be distinct clubs.',
      );
    }

    // 4. Validate Home Venue membership
    if (dto.homeVenueId) {
      const venueExists = await this.prisma.venue.findFirst({
        where: { venueId: dto.homeVenueId },
      });
      if (!venueExists) {
        throw new BadRequestException(
          'Selected home venue is not valid.',
        );
      }
    }

    // 5. Prevent double registration
    const existing = await this.prisma.tournamentRegistration.findFirst({
      where: {
        tournamentId,
        playerId: dto.playerId,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Player is already registered for this tournament',
      );
    }

    // 6. Handle potential base64 Data URL for player photo
    let resolvedPhotoKey = dto.playerPhotoUrl;
    if (dto.playerPhotoUrl && dto.playerPhotoUrl.startsWith('data:')) {
      try {
        resolvedPhotoKey = await uploadBase64ToS3(
          dto.playerPhotoUrl,
          `reg-photo-${dto.playerId}`,
        );
      } catch (err) {
        this.logger.warn(
          `Failed to convert base64 photo to S3: ${err?.message}`,
        );
      }
    }

    // 7. Calculate status according to tournament capacity
    const currentConfirmedOrRegistered = tournament.registrations.filter(
      (r) =>
        r.status === TournamentRegistrationStatus.CONFIRMED ||
        r.status === TournamentRegistrationStatus.REGISTERED ||
        r.status === TournamentRegistrationStatus.SELECTED_UNPAID,
    ).length;

    const initialStatus =
      currentConfirmedOrRegistered >= tournament.capacity
        ? TournamentRegistrationStatus.WAITLISTED
        : TournamentRegistrationStatus.REGISTERED;

    const qrCodeString = `PLAYER:${tournamentId}:${dto.playerId}`;

    const created = await this.prisma.tournamentRegistration.create({
      data: {
        tournamentId,
        playerId: dto.playerId,
        homeVenueId: dto.homeVenueId || null,
        primaryTeamId: dto.primaryTeamId || null,
        secondaryTeamId: dto.secondaryTeamId || null,
        jerseySize: dto.jerseySize || null,
        playerPhotoUrl: resolvedPhotoKey || null,
        qrCodeString,
        status: initialStatus,
        paymentStatus: 'PENDING',
      },
      include: {
        player: {
          select: {
            playerId: true,
            firstName: true,
            lastName: true,
            gamerTag: true,
            email: true,
          },
        },
      },
    });

    // Production Ticket Parity:
    // Automatically issue an ACTIVE Gate Clearance Ticket for this competitor
    try {
      await this.prisma.ticket.upsert({
        where: { qrToken: qrCodeString },
        update: {
          status: 'ACTIVE',
          checkedIn: false,
          playerId: dto.playerId,
          purchasedBy: dto.playerId,
        },
        create: {
          tournamentId,
          playerId: dto.playerId,
          purchasedBy: dto.playerId,
          purchaserRole: 'PLAYER',
          type: 'DAY_PASS',
          pricePaid: tournament.entryFee || 0,
          currency: tournament.currency || 'NGN',
          status: 'ACTIVE',
          qrToken: qrCodeString,
          checkedIn: false,
          showTicketId: `PASS-${created.registrationId.slice(0, 8).toUpperCase()}`,
        },
      });
    } catch (ticketErr: any) {
      this.logger.warn(
        `Companion ticket creation notice: ${ticketErr?.message}`,
      );
    }

    return {
      ...created,
      id: created.registrationId,
      teamSelection: {
        primaryTeamId: created.primaryTeamId,
        secondaryTeamId: created.secondaryTeamId,
      },
    };
  }

  /**
   * Gets all tournament registrations grouped by tabs (Registered, Selected Unpaid, Confirmed, Waitlist).
   */
  async getTournamentRegistrations(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });

    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const registrations = await this.prisma.tournamentRegistration.findMany({
      where: { tournamentId },
      include: {
        player: {
          select: {
            playerId: true,
            firstName: true,
            lastName: true,
            gamerTag: true,
            email: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      registered: registrations.filter(
        (r) => r.status === TournamentRegistrationStatus.REGISTERED,
      ),
      selectedUnpaid: registrations.filter(
        (r) => r.status === TournamentRegistrationStatus.SELECTED_UNPAID,
      ),
      confirmed: registrations.filter(
        (r) => r.status === TournamentRegistrationStatus.CONFIRMED,
      ),
      waitlist: registrations.filter(
        (r) => r.status === TournamentRegistrationStatus.WAITLISTED,
      ),
      totalCount: registrations.length,
    };
  }

  /**
   * Updates registration status (e.g. promoting from Registered to Confirmed).
   */
  async updateRegistrationStatus(
    tournamentId: string,
    registrationId: string,
    dto: UpdateRegistrationStatusDto,
  ) {
    const registration = await this.prisma.tournamentRegistration.findFirst({
      where: {
        registrationId,
        tournamentId,
      },
    });

    if (!registration) {
      throw new NotFoundException(`Registration #${registrationId} not found`);
    }

    return this.prisma.tournamentRegistration.update({
      where: { registrationId },
      data: {
        status: dto.status,
        ...(dto.paymentStatus ? { paymentStatus: dto.paymentStatus } : {}),
      },
      include: {
        player: true,
      },
    });
  }

  /**
   * Open tournament registration with mode, capacity, and deadline.
   */
  async openRegistration(tournamentId: string, dto: OpenRegistrationDto) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    return this.prisma.tournament.update({
      where: { tournamentId },
      data: {
        registrationOpen: true,
        registrationCutOffMode: dto.mode,
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.deadline ? { deadline: new Date(dto.deadline) } : {}),
        ...(dto.requireJerseySize !== undefined
          ? { requireJerseySize: dto.requireJerseySize }
          : {}),
      },
    });
  }

  /**
   * Close tournament registration.
   */
  async closeRegistration(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    return this.prisma.tournament.update({
      where: { tournamentId },
      data: { registrationOpen: false },
    });
  }

  /**
   * Registrations with Counts & Tabs for Admin Registration Management
   */
  async getTournamentRegistrationsWithCounts(
    tournamentId: string,
    query: QueryTournamentRegistrationDto,
  ) {
    const { tab, status, paymentStatus, search, page = 1, limit = 25 } = query;
    const skip = (page - 1) * limit;

    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found');
    }

    const [regCount, selectedCount, confirmedCount, waitlistCount] =
      await Promise.all([
        this.prisma.tournamentRegistration.count({
          where: {
            tournamentId,
            status: TournamentRegistrationStatus.REGISTERED,
          },
        }),
        this.prisma.tournamentRegistration.count({
          where: {
            tournamentId,
            status: TournamentRegistrationStatus.SELECTED_UNPAID,
          },
        }),
        this.prisma.tournamentRegistration.count({
          where: {
            tournamentId,
            status: TournamentRegistrationStatus.CONFIRMED,
          },
        }),
        this.prisma.tournamentRegistration.count({
          where: {
            tournamentId,
            status: TournamentRegistrationStatus.WAITLISTED,
          },
        }),
      ]);

    let statusFilter: TournamentRegistrationStatus | undefined = status;
    if (tab === 'registered') {
      statusFilter = TournamentRegistrationStatus.REGISTERED;
    } else if (tab === 'selected') {
      statusFilter = TournamentRegistrationStatus.SELECTED_UNPAID;
    } else if (tab === 'confirmed') {
      statusFilter = TournamentRegistrationStatus.CONFIRMED;
    } else if (tab === 'waitlist') {
      statusFilter = TournamentRegistrationStatus.WAITLISTED;
    }

    const where: Prisma.TournamentRegistrationWhereInput = {
      tournamentId,
      ...(statusFilter && { status: statusFilter }),
      ...(paymentStatus && {
        paymentStatus: { equals: paymentStatus, mode: 'insensitive' },
      }),
      ...(search && {
        player: {
          OR: [
            { gamerTag: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        },
      }),
    };

    const [totalItems, registrations] = await Promise.all([
      this.prisma.tournamentRegistration.count({ where }),
      this.prisma.tournamentRegistration.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          player: {
            select: {
              playerId: true,
              firstName: true,
              lastName: true,
              gamerTag: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const items = registrations.map((r) => ({
      id: r.registrationId,
      playerId: r.playerId,
      userId: r.player.playerId,
      playerProfileId: `prof-${r.playerId.slice(0, 8)}`,
      fullName: `${r.player.firstName} ${r.player.lastName}`.trim(),
      gamertag: r.player.gamerTag || r.player.firstName,
      playerPhotoUrl: r.playerPhotoUrl,
      homeVenueId: r.homeVenueId,
      homeVenueName: 'Venue',
      teamSelection: {
        primaryTeamId: r.primaryTeamId,
        secondaryTeamId: r.secondaryTeamId,
      },
      jerseySize: r.jerseySize,
      status: r.status,
      paymentStatus: r.paymentStatus,
      registrationDate: r.createdAt,
      paymentDeadline: r.paymentDeadline,
      checkedInVenue: r.checkedInVenue,
      qrCodeString: r.qrCodeString,
      assignedSlot: r.assignedSlot,
      version: r.version,
    }));

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items,
      counts: {
        registered: regCount,
        selectedUnpaid: selectedCount,
        confirmed: confirmedCount,
        waitlisted: waitlistCount,
      },
      pagination: {
        totalItems,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Bulk or manual selection of registrations for payment windows
   */
  async selectRegistrations(
    tournamentId: string,
    dto: RegistrationSelectionDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found');
    }

    if (
      dto.expectedVersion !== undefined &&
      dto.expectedVersion !== tournament.version
    ) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: `Version conflict: Expected version ${dto.expectedVersion}, but current version is ${tournament.version}`,
      });
    }

    let targetRegs: { registrationId: string }[] = [];

    if (dto.mode === SelectionMode.MANUAL) {
      if (!dto.registrationIds || dto.registrationIds.length === 0) {
        throw new BadRequestException(
          'registrationIds is required for manual mode',
        );
      }
      const foundRegs = await this.prisma.tournamentRegistration.findMany({
        where: {
          tournamentId,
          OR: [
            { registrationId: { in: dto.registrationIds } },
            { playerId: { in: dto.registrationIds } },
          ],
        },
        select: { registrationId: true },
      });
      targetRegs =
        foundRegs && foundRegs.length > 0
          ? foundRegs
          : dto.registrationIds.map((id) => ({ registrationId: id }));
    } else if (dto.mode === SelectionMode.FIRST_IN) {
      const count = dto.count || 16;
      targetRegs = await this.prisma.tournamentRegistration.findMany({
        where: {
          tournamentId,
          status: TournamentRegistrationStatus.REGISTERED,
        },
        orderBy: { createdAt: 'asc' },
        take: count,
        select: { registrationId: true },
      });
    } else if (dto.mode === SelectionMode.RANDOM) {
      const count = dto.count || 16;
      const allRegistered = await this.prisma.tournamentRegistration.findMany({
        where: {
          tournamentId,
          status: TournamentRegistrationStatus.REGISTERED,
        },
        select: { registrationId: true },
      });
      const shuffled = [...allRegistered].sort(() => 0.5 - Math.random());
      targetRegs = shuffled.slice(0, count);
    }

    const windowHours =
      dto.paymentWindowHours || tournament.paymentWindow || 24;
    const paymentDeadline = new Date(Date.now() + windowHours * 60 * 60 * 1000);
    const targetIds = targetRegs.map((r) => r.registrationId);

    if (targetIds.length > 0) {
      await this.prisma.tournamentRegistration.updateMany({
        where: { registrationId: { in: targetIds } },
        data: {
          status: TournamentRegistrationStatus.SELECTED_UNPAID,
          paymentDeadline,
          version: { increment: 1 },
        },
      });
    }

    return {
      selectedCount: targetIds.length,
      paymentDeadline,
      updatedRegistrationIds: targetIds,
    };
  }

  /**
   * Process expired payment windows, reverting unpaid participants to registered
   */
  async processPaymentExpiry(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found');
    }

    const now = new Date();
    const expiredRegs = await this.prisma.tournamentRegistration.findMany({
      where: {
        tournamentId,
        status: TournamentRegistrationStatus.SELECTED_UNPAID,
        paymentDeadline: { lt: now },
      },
      select: { registrationId: true },
    });

    const expiredIds = expiredRegs.map((r) => r.registrationId);

    if (expiredIds.length > 0) {
      await this.prisma.tournamentRegistration.updateMany({
        where: { registrationId: { in: expiredIds } },
        data: {
          status: TournamentRegistrationStatus.REGISTERED,
          paymentDeadline: null,
          version: { increment: 1 },
        },
      });
    }

    return {
      expiredCount: expiredIds.length,
      revertedRegistrationIds: expiredIds,
    };
  }

  /**
   * Confirm participant registration payment and assign tournament slot
   */
  async confirmRegistrationPayment(
    registrationId: string,
    expectedVersion?: number,
    notes?: string,
  ) {
    const reg = await this.prisma.tournamentRegistration.findUnique({
      where: { registrationId },
      include: { tournament: true },
    });
    if (!reg) {
      throw new NotFoundException(`Registration '${registrationId}' not found`);
    }

    if (expectedVersion !== undefined && expectedVersion !== reg.version) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: `Version conflict: Expected version ${expectedVersion}, but current version is ${reg.version}`,
      });
    }

    const existingConfirmed = await this.prisma.tournamentRegistration.findMany(
      {
        where: {
          tournamentId: reg.tournamentId,
          status: TournamentRegistrationStatus.CONFIRMED,
          assignedSlot: { not: null },
        },
        select: { assignedSlot: true },
      },
    );

    const occupiedSlots = new Set(
      existingConfirmed.map((c) => c.assignedSlot!),
    );
    let assignedSlot = 1;
    while (occupiedSlots.has(assignedSlot)) {
      assignedSlot++;
    }

    const updated = await this.prisma.tournamentRegistration.update({
      where: { registrationId },
      data: {
        status: TournamentRegistrationStatus.CONFIRMED,
        paymentStatus: 'PAID',
        assignedSlot,
        version: { increment: 1 },
      },
    });

    return {
      registration: {
        id: updated.registrationId,
        status: updated.status,
        paymentStatus: updated.paymentStatus,
        version: updated.version,
      },
      assignedSlot: {
        slotNumber: assignedSlot,
        participantId: updated.playerId,
      },
      notes,
    };
  }

  /**
   * Refund participant registration and release slot
   */
  async refundRegistration(
    registrationId: string,
    expectedVersion?: number,
    reason?: string,
  ) {
    const reg = await this.prisma.tournamentRegistration.findUnique({
      where: { registrationId },
    });
    if (!reg) {
      throw new NotFoundException(`Registration '${registrationId}' not found`);
    }

    if (expectedVersion !== undefined && expectedVersion !== reg.version) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: `Version conflict: Expected version ${expectedVersion}, but current version is ${reg.version}`,
      });
    }

    const releasedSlotNumber = reg.assignedSlot;

    const updated = await this.prisma.tournamentRegistration.update({
      where: { registrationId },
      data: {
        status: TournamentRegistrationStatus.WAITLISTED,
        paymentStatus: 'REFUNDED',
        assignedSlot: null,
        version: { increment: 1 },
      },
    });

    return {
      registrationId: updated.registrationId,
      status: updated.status,
      refundTransactionId: `tx-ref-${Date.now().toString().slice(-6)}`,
      releasedSlotNumber,
      reason,
    };
  }
}
