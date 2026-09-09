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

@Injectable()
export class PlayerService {
  constructor(private prisma: PrismaService) {}

  async createPlayer(createPlayerDto: CreatePlayerDto) {
    const existingPlayer = await this.prisma.player.findUnique({
      where: { email: createPlayerDto.email },
    });

    if (existingPlayer) {
      if (existingPlayer.isDeleted) {
        throw new ConflictException('This account has been deactivated.');
      }
      throw new ConflictException('Player with this email already exists');
    }

    const existingShowId = await this.prisma.player.findUnique({
      where: { showPlayerId: createPlayerDto.showPlayerId },
    });

    if (existingShowId) {
      throw new ConflictException('Player with this Show ID already exists');
    }

    const { password, documents, ...rest } = createPlayerDto;
    const hashedPassword = await bcrypt.hash(password, 10);

    return this.prisma.player.create({
      data: {
        ...rest,
        password: hashedPassword,
        document: documents || [],
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

    const { password, documents, ...restData } = updatePlayerDto;
    let hashedPassword: string | undefined = undefined;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Merge existing documents with new ones if provided, or overwrite. Let's overwrite for simplicity unless logic demands otherwise.
    // Or just append new documents to existing. Let's append new ones to the array.
    const newDocs = (documents as string[]) || [];
    const updatedDocuments =
      newDocs.length > 0
        ? [...existingPlayer.document, ...newDocs]
        : existingPlayer.document;

    return this.prisma.player.update({
      where: { playerId: id },
      data: {
        ...restData,
        document: updatedDocuments,
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

    const meta = calculatePaginationMeta(total, page, limit);

    return { data, meta };
  }

  async deletePlayer(id: string) {
    const player = await this.prisma.player.findUnique({
      where: { playerId: id },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return this.prisma.player.update({
      where: { playerId: id },
      data: {
        isDeleted: true,
      },
    });
  }
}
