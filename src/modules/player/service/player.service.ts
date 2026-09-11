import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CreatePlayerDto } from '../dto/create-player.dto';
import { UpdatePlayerDto } from '../dto/update-player.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import {
  buildPrismaQuery,
  calculatePaginationMeta,
  QueryOptions,
} from '../../utils/query.util';
import { getPreSignedUrl, deleteImageFromS3 } from '../../utils/s3.util';
import { generatePlayerId } from '../utils/generate-id.util';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../../mail/mail.service';

@Injectable()
export class PlayerService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  async createPlayer(createPlayerDto: CreatePlayerDto) {
    const existingPlayer = await this.prisma.player.findUnique({
      where: { email: createPlayerDto.email },
    });

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
          'This account has been deactivated. A recovery link has been sent to your email.',
        );
      }
      throw new ConflictException('Player with this email already exists');
    }

    const { password, documents, ...rest } = createPlayerDto;
    const hashedPassword = await bcrypt.hash(
      password,
      Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
    );
    const showPlayerId = await generatePlayerId(this.prisma);

    return this.prisma.player.create({
      data: {
        ...rest,
        password: hashedPassword,
        document: documents || [],
        showPlayerId,
      },
    });
  }

  async updatePlayer(id: string, updatePlayerDto: UpdatePlayerDto) {
    const existingPlayer = await this.prisma.player.findUnique({
      where: { playerId: id },
    });

    if (!existingPlayer) {
      throw new NotFoundException('Player not found');
    }

    if (
      updatePlayerDto.email &&
      updatePlayerDto.email !== existingPlayer.email
    ) {
      const emailTaken = await this.prisma.player.findUnique({
        where: { email: updatePlayerDto.email },
      });
      if (emailTaken) {
        throw new ConflictException('Email is already in use');
      }
    }

    const { password, documents, deletedDocuments, ...restData } =
      updatePlayerDto;
    let hashedPassword: string | undefined = undefined;
    if (password) {
      hashedPassword = await bcrypt.hash(
        password,
        Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
      );
    }

    let finalDocuments = existingPlayer.document || [];

    const extractKey = (urlOrKey: string) => {
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

    if (deletedDocuments && deletedDocuments.length > 0) {
      const deletedKeys = deletedDocuments.map(extractKey);
      await Promise.all(deletedKeys.map((key) => deleteImageFromS3(key)));
      finalDocuments = finalDocuments.filter((doc) => {
        const docKey = extractKey(doc);
        return !deletedKeys.includes(docKey);
      });
    }

    const newDocs = (documents as string[]) || [];
    finalDocuments = [...finalDocuments, ...newDocs];

    return this.prisma.player.update({
      where: { playerId: id },
      data: {
        ...restData,
        document: finalDocuments,
        ...(hashedPassword ? { password: hashedPassword } : {}),
      },
    });
  }

  async getPlayerById(id: string) {
    if (!id) {
      throw new NotFoundException('Player ID is required');
    }

    const player = await this.prisma.player.findUnique({
      where: { playerId: id },
      include: {
        registrationHistory: true,
        marketingData: true,
      },
    });

    if (!player || player.isDeleted) {
      throw new NotFoundException('Player not found');
    }

    if (player.document && player.document.length > 0) {
      player.document = await Promise.all(
        player.document.map(async (doc) => getPreSignedUrl(doc)),
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...playerWithoutPassword } = player;
    return playerWithoutPassword;
  }

  async getAllPlayer(query: QueryOptions = {}) {
    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      ['firstName', 'lastName', 'email', 'showPlayerId', 'phoneNumber'],
    );

    where.isDeleted = false;

    const [data, total] = await Promise.all([
      this.prisma.player.findMany({
        where,
        skip,
        take,
        orderBy,
      }),
      this.prisma.player.count({ where }),
    ]);

    const safeData = await Promise.all(
      data.map(async (player) => {
        if (player.document && player.document.length > 0) {
          player.document = await Promise.all(
            player.document.map(async (doc) => getPreSignedUrl(doc)),
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...playerWithoutPassword } = player;
        return playerWithoutPassword;
      }),
    );

    const meta = calculatePaginationMeta(total, page, limit);

    return { data: safeData, meta };
  }

  async recoverPlayer(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
      }>(token);
      const player = await this.prisma.player.findUnique({
        where: { playerId: payload.sub },
      });

      if (!player) {
        throw new NotFoundException('Player not found');
      }

      if (!player.isDeleted) {
        throw new ConflictException('Player account is already active');
      }

      return await this.prisma.player.update({
        where: { playerId: player.playerId },
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

  async deletePlayer(id: string) {
    const player = await this.prisma.player.findUnique({
      where: { playerId: id },
    });

    if (!player || player.isDeleted) {
      throw new NotFoundException('Player not found or already deleted');
    }

    return this.prisma.player.update({
      where: { playerId: id },
      data: {
        isDeleted: true,
      },
    });
  }
}
