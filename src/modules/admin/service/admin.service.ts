import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../../mail/mail.service';
import { CreateAdminDto } from '../dto/create-admin.dto';
import { UpdateAdminDto } from '../dto/update-admin.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import {
  buildPrismaQuery,
  calculatePaginationMeta,
  QueryOptions,
} from '../../utils/query.util';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  async createAdmin(createAdminDto: CreateAdminDto) {
    const existingAdmin = await this.prisma.admin.findUnique({
      where: { email: createAdminDto.email },
    });

    if (existingAdmin) {
      if (existingAdmin.isDeleted) {
        const token = await this.jwtService.signAsync(
          { sub: existingAdmin.adminId, email: existingAdmin.email },
          { expiresIn: '15m' },
        );
        await this.mailService.sendRecoveryLink(existingAdmin.email, token);
        throw new ConflictException(
          'This account has been deactivated. A recovery link has been sent to your email.',
        );
      }
      throw new ConflictException('Admin with this email already exists');
    }

    const { password, ...rest } = createAdminDto;
    const hashedPassword = await bcrypt.hash(password, 10);

    return this.prisma.admin.create({
      data: {
        ...rest,
        password: hashedPassword,
      },
    });
  }

  async updateAdmin(id: string, updateAdminDto: UpdateAdminDto) {
    // 1. Check if the admin exists
    const existingAdmin = await this.prisma.admin.findUnique({
      where: { adminId: id },
    });

    if (!existingAdmin) {
      throw new NotFoundException('Admin not found');
    }

    // 2. Check email uniqueness if email is being updated
    if (updateAdminDto.email && updateAdminDto.email !== existingAdmin.email) {
      const emailTaken = await this.prisma.admin.findUnique({
        where: { email: updateAdminDto.email },
      });
      if (emailTaken) {
        throw new ConflictException('Email is already in use by another admin');
      }
    }

    // 3. Prepare data safely without using 'any'
    const { password, ...restData } = updateAdminDto;
    let hashedPassword: string | undefined = undefined;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // 4. Perform the update
    return this.prisma.admin.update({
      where: { adminId: id },
      data: {
        ...restData,
        ...(hashedPassword ? { password: hashedPassword } : {}),
      },
    });
  }

  async getAdminById(id: string) {
    if (!id) {
      throw new NotFoundException('Admin ID is required');
    }

    const admin = await this.prisma.admin.findUnique({
      where: { adminId: id },
    });

    if (!admin || admin.isDeleted) {
      throw new NotFoundException('Admin not found');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...adminWithoutPassword } = admin;
    return adminWithoutPassword;
  }

  async getAllAdmin(query: QueryOptions = {}) {
    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      ['name', 'email'],
    );

    where.isDeleted = false;

    const [data, total] = await Promise.all([
      this.prisma.admin.findMany({
        where,
        skip,
        take,
        orderBy,
      }),
      this.prisma.admin.count({ where }),
    ]);

    const meta = calculatePaginationMeta(total, page, limit);

    return { data, meta };
  }

  async deleteAdmin(id: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { adminId: id },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    return this.prisma.admin.update({
      where: { adminId: id },
      data: {
        isDeleted: true,
      },
    });
  }

  async recoverAdmin(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
      }>(token);
      const admin = await this.prisma.admin.findUnique({
        where: { adminId: payload.sub },
      });

      if (!admin) {
        throw new NotFoundException('Admin not found');
      }

      if (!admin.isDeleted) {
        throw new ConflictException('Admin account is already active');
      }

      return await this.prisma.admin.update({
        where: { adminId: admin.adminId },
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
