import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CreateFanDto } from '../dto/create-fan.dto';
import { UpdateFanDto } from '../dto/update-fan.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import {
  buildPrismaQuery,
  calculatePaginationMeta,
  QueryOptions,
} from '../../utils/query.util';
import { getPreSignedUrl, deleteImageFromS3 } from '../../utils/s3.util';
import { generateFanId } from '../utils/generate-id.util';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../../mail/mail.service';

@Injectable()
export class FanService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  async createFan(createFanDto: CreateFanDto) {
    const existingFan = await this.prisma.fan.findUnique({
      where: { email: createFanDto.email },
    });

    if (existingFan) {
      if (existingFan.isDeleted) {
        const token = await this.jwtService.signAsync(
          { sub: existingFan.fanId, email: existingFan.email },
          {
            expiresIn: (process.env.RECOVERY_TOKEN_EXPIRATION || '15m') as any,
          },
        );
        await this.mailService.sendRecoveryLink(existingFan.email, token);
        throw new ConflictException(
          'This account has been deactivated. A recovery link has been sent to your email.',
        );
      }
      throw new ConflictException('Fan with this email already exists');
    }

    const { password, ...rest } = createFanDto;
    const hashedPassword = await bcrypt.hash(
      password,
      Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
    );
    const showFanId = await generateFanId(this.prisma);

    return this.prisma.fan.create({
      data: {
        ...rest,
        password: hashedPassword,
        showFanId,
      },
    });
  }

  async updateFan(id: string, updateFanDto: UpdateFanDto) {
    const existingFan = await this.prisma.fan.findUnique({
      where: { fanId: id },
    });

    if (!existingFan) {
      throw new NotFoundException('Fan not found');
    }

    if (updateFanDto.email && updateFanDto.email !== existingFan.email) {
      const emailTaken = await this.prisma.fan.findUnique({
        where: { email: updateFanDto.email },
      });
      if (emailTaken) {
        throw new ConflictException('Email is already in use');
      }
    }

    const { password, profileImage, ...restData } = updateFanDto;
    let hashedPassword: string | undefined = undefined;
    if (password) {
      hashedPassword = await bcrypt.hash(
        password,
        Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
      );
    }

    if (profileImage && existingFan.profileImage) {
      await deleteImageFromS3(existingFan.profileImage);
    }

    return this.prisma.fan.update({
      where: { fanId: id },
      data: {
        ...restData,
        ...(profileImage ? { profileImage } : {}),
        ...(hashedPassword ? { password: hashedPassword } : {}),
      },
    });
  }

  async getFanById(id: string) {
    if (!id) {
      throw new NotFoundException('Fan ID is required');
    }

    const fan = await this.prisma.fan.findUnique({
      where: { fanId: id },
    });

    if (!fan || fan.isDeleted) {
      throw new NotFoundException('Fan not found');
    }

    if (fan.profileImage) {
      fan.profileImage = await getPreSignedUrl(fan.profileImage);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...fanWithoutPassword } = fan;
    return fanWithoutPassword;
  }

  async getAllFan(query: QueryOptions = {}) {
    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      ['firstName', 'email', 'showFanId', 'phoneNumber'],
    );

    where.isDeleted = false;

    const [data, total] = await Promise.all([
      this.prisma.fan.findMany({
        where,
        skip,
        take,
        orderBy,
      }),
      this.prisma.fan.count({ where }),
    ]);

    const safeData = await Promise.all(
      data.map(async (fan) => {
        if (fan.profileImage) {
          fan.profileImage = await getPreSignedUrl(fan.profileImage);
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...fanWithoutPassword } = fan;
        return fanWithoutPassword;
      }),
    );

    const meta = calculatePaginationMeta(total, page, limit);

    return { data: safeData, meta };
  }

  async recoverFan(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
      }>(token);
      const fan = await this.prisma.fan.findUnique({
        where: { fanId: payload.sub },
      });

      if (!fan) {
        throw new NotFoundException('Fan not found');
      }

      if (!fan.isDeleted) {
        throw new ConflictException('Fan account is already active');
      }

      return await this.prisma.fan.update({
        where: { fanId: fan.fanId },
        data: {
          isDeleted: false,
        },
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new ConflictException('Recovery link has expired');
      }
      throw new ConflictException('Invalid recovery link');
    }
  }

  async deleteFan(id: string) {
    const fan = await this.prisma.fan.findUnique({
      where: { fanId: id },
    });

    if (!fan || fan.isDeleted) {
      throw new NotFoundException('Fan not found or already deleted');
    }

    return this.prisma.fan.update({
      where: { fanId: id },
      data: {
        isDeleted: true,
      },
    });
  }
}
