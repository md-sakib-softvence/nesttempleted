import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateMarketingDataDto } from '../dto/create-marketing-data.dto';
import * as bcrypt from 'bcrypt';
import { RegisterAs } from '@prisma/client';
import { generateFanId } from '../../fan/utils/generate-id.util';
import { generatePlayerId } from '../../player/utils/generate-id.util';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../../mail/mail.service';
import { UpdateMarketingDataDto } from '../dto/update-marketing-data.dto';
import {
  buildPrismaQuery,
  calculatePaginationMeta,
  QueryOptions,
} from '../../utils/query.util';

@Injectable()
export class MarketingDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async createMarketingData(dto: CreateMarketingDataDto) {
    // 1. Check if email already exists in Fan or Player
    const [existingFan, existingPlayer] = await Promise.all([
      this.prisma.fan.findUnique({ where: { email: dto.email } }),
      this.prisma.player.findUnique({ where: { email: dto.email } }),
    ]);

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
          'This fan account has been deactivated. A recovery link has been sent to your email.',
        );
      }
      throw new ConflictException('A fan with this email already exists.');
    }

    if (existingPlayer) {
      if (existingPlayer.isDeleted) {
        const token = await this.jwtService.signAsync(
          { sub: existingPlayer.playerId, email: existingPlayer.email },
          {
            expiresIn: (process.env.RECOVERY_TOKEN_EXPIRATION || '15m') as any,
          },
        );
        await this.mailService.sendRecoveryLink(existingPlayer.email, token);
        throw new ConflictException(
          'This player account has been deactivated. A recovery link has been sent to your email.',
        );
      }
      throw new ConflictException('A player with this email already exists.');
    }

    if (dto.employeeId) {
      const existingEmployee = await this.prisma.employee.findUnique({
        where: { employeeId: dto.employeeId },
      });

      if (!existingEmployee || existingEmployee.isDeleted) {
        throw new NotFoundException(
          'The provided employee ID does not exist or is deleted.',
        );
      }
    }

    const staticPassword = 'DefaultPassword123!';
    const hashedPassword = await bcrypt.hash(
      staticPassword,
      Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
    );

    // Prepare marketing data omitting user-specific auth fields
    const {
      firstName,
      lastName,
      surname,
      email,
      phoneNumber,
      ...marketingDataFields
    } = dto;

    return this.prisma.$transaction(async (tx) => {
      let createdMarketingData;

      if (dto.registerAs === RegisterAs.FRIEND) {
        // Create Fan
        const showFanId = await generateFanId(tx as any);

        const createdFan = await tx.fan.create({
          data: {
            showFanId,
            firstName,
            surname,
            email,
            phoneNumber,
            password: hashedPassword,
            gender: dto.gender,
            ageRange: dto.ageRange,
            favoriteGame: dto.favoriteGameConsole,
          },
        });

        // Create MarketingDataCollection linked to Fan
        createdMarketingData = await tx.marketingDataCollection.create({
          data: {
            ...marketingDataFields,
            fanId: createdFan.fanId,
          },
        });
      } else if (dto.registerAs === RegisterAs.PLAYER) {
        // Create Player
        if (!lastName) {
          throw new ConflictException(
            'lastName is required to register as PLAYER',
          );
        }

        const showPlayerId = await generatePlayerId(tx as any);

        const createdPlayer = await tx.player.create({
          data: {
            showPlayerId,
            firstName,
            lastName,
            surname,
            email,
            phoneNumber,
            password: hashedPassword,
          },
        });

        // Create MarketingDataCollection linked to Player
        createdMarketingData = await tx.marketingDataCollection.create({
          data: {
            ...marketingDataFields,
            playerId: createdPlayer.playerId,
          },
        });
      } else {
        throw new ConflictException('Invalid registerAs value');
      }

      return createdMarketingData;
    });
  }

  async getAllMarketingData(query: QueryOptions = {}) {
    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      [
        'favoriteGameConsole',
        'favoriteFootballGame',
        'profession',
        'area',
      ],
    );

    where.isDeleted = false;

    const [data, total] = await Promise.all([
      this.prisma.marketingDataCollection.findMany({
        where,
        skip,
        take,
        orderBy,
      }),
      this.prisma.marketingDataCollection.count({ where }),
    ]);

    const meta = calculatePaginationMeta(total, page, limit);

    return { data, meta };
  }

  async getMarketingDataById(id: string) {
    if (!id) {
      throw new NotFoundException('Marketing Data ID is required');
    }

    const data = await this.prisma.marketingDataCollection.findUnique({
      where: { marketingDataCollectionId: id },
    });

    if (!data || data.isDeleted) {
      throw new NotFoundException('Marketing data not found');
    }

    return data;
  }

  async updateMarketingData(id: string, updateDto: UpdateMarketingDataDto) {
    const existingData = await this.prisma.marketingDataCollection.findUnique({
      where: { marketingDataCollectionId: id },
      include: { fan: true, player: true },
    });

    if (!existingData || existingData.isDeleted) {
      throw new NotFoundException('Marketing data not found');
    }

    const {
      firstName,
      lastName,
      surname,
      email,
      phoneNumber,
      employeeId,
      registerAs,
      gender,
      ageRange,
      favoriteGameConsole,
      ...marketingDataFields
    } = updateDto;

    if (registerAs && registerAs !== existingData.registerAs) {
      throw new ConflictException(
        'Cannot change the registerAs role (FRIEND/PLAYER) after creation.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Validate employee ID if provided
      if (employeeId !== undefined && employeeId !== existingData.employeeId) {
        if (employeeId) {
          const emp = await tx.employee.findUnique({ where: { employeeId } });
          if (!emp || emp.isDeleted) {
            throw new NotFoundException(
              'The provided employee ID does not exist or is deleted.',
            );
          }
        }
      }

      // 2. Validate email uniqueness if email is changed
      if (email) {
        const checkEmailFan =
          existingData.fan && email !== existingData.fan.email
            ? await tx.fan.findUnique({ where: { email } })
            : null;

        const checkEmailPlayer =
          existingData.player && email !== existingData.player.email
            ? await tx.player.findUnique({ where: { email } })
            : null;

        if (checkEmailFan || checkEmailPlayer) {
          throw new ConflictException(
            'Email is already in use by another user.',
          );
        }
      }

      // 3. Update associated Fan or Player
      if (existingData.registerAs === RegisterAs.FRIEND && existingData.fan) {
        await tx.fan.update({
          where: { fanId: existingData.fan.fanId },
          data: {
            ...(firstName ? { firstName } : {}),
            ...(surname ? { surname } : {}),
            ...(email ? { email } : {}),
            ...(phoneNumber ? { phoneNumber } : {}),
            ...(gender ? { gender } : {}),
            ...(ageRange ? { ageRange } : {}),
            ...(favoriteGameConsole
              ? { favoriteGame: favoriteGameConsole }
              : {}),
          },
        });
      } else if (
        existingData.registerAs === RegisterAs.PLAYER &&
        existingData.player
      ) {
        await tx.player.update({
          where: { playerId: existingData.player.playerId },
          data: {
            ...(firstName ? { firstName } : {}),
            ...(lastName ? { lastName } : {}),
            ...(surname ? { surname } : {}),
            ...(email ? { email } : {}),
            ...(phoneNumber ? { phoneNumber } : {}),
          },
        });
      }

      // 4. Update MarketingDataCollection itself
      return tx.marketingDataCollection.update({
        where: {
          marketingDataCollectionId: existingData.marketingDataCollectionId,
        },
        data: {
          ...marketingDataFields,
          ...(gender ? { gender } : {}),
          ...(ageRange ? { ageRange } : {}),
          ...(favoriteGameConsole ? { favoriteGameConsole } : {}),
          ...(employeeId !== undefined ? { employeeId } : {}),
        },
      });
    });
  }

  async deleteMarketingData(id: string) {
    const existingData = await this.getMarketingDataById(id);

    return this.prisma.marketingDataCollection.update({
      where: {
        marketingDataCollectionId: existingData.marketingDataCollectionId,
      },
      data: { isDeleted: true },
    });
  }
}
