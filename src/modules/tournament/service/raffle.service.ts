import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateRaffleDto } from '../dto/tournament/create-raffle.dto';
import { RaffleStatus } from '@prisma/client';
import {
  buildPrismaQuery,
  calculatePaginationMeta,
  QueryOptions,
} from '../../utils/query.util';

@Injectable()
export class RaffleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all raffles across tournaments (with optional search, filter & pagination)
   */
  async getAllRaffles(
    query: QueryOptions = {},
    tournamentId?: string,
    status?: RaffleStatus,
  ) {
    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      ['name', 'prizeDescription'],
    );

    // Normalize status filter (case-insensitive)
    let statusFilter: RaffleStatus | undefined = undefined;
    const rawStatus = (status || (query as any)?.status || '')
      .toString()
      .trim()
      .toUpperCase();

    if (
      rawStatus &&
      Object.values(RaffleStatus).includes(rawStatus as RaffleStatus)
    ) {
      statusFilter = rawStatus as RaffleStatus;
    }

    const filterWhere: any = {
      ...where,
      ...(tournamentId ? { tournamentId } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.raffle.findMany({
        where: filterWhere,
        include: {
          tournament: {
            select: {
              tournamentId: true,
              name: true,
              gameTitle: true,
              status: true,
            },
          },
        },
        skip,
        take,
        orderBy: orderBy || { createdAt: 'desc' },
      }),
      this.prisma.raffle.count({ where: filterWhere }),
    ]);

    const formattedData = data.map((raffle) => {
      const entries = Array.isArray(raffle.entries)
        ? (raffle.entries as any[])
        : [];
      const winners = Array.isArray(raffle.winners)
        ? (raffle.winners as any[])
        : [];
      return {
        ...raffle,
        totalEntries: entries.length,
        totalWinners: winners.length,
      };
    });

    const meta = calculatePaginationMeta(total, page, limit);
    return { data: formattedData, meta };
  }

  /**
   * Get all raffles for a specific tournament
   */
  async getRafflesByTournament(tournamentId: string) {
    const raffles = await this.prisma.raffle.findMany({
      where: { tournamentId },
      orderBy: { createdAt: 'desc' },
    });

    return raffles.map((raffle) => {
      const entries = Array.isArray(raffle.entries)
        ? (raffle.entries as any[])
        : [];
      const winners = Array.isArray(raffle.winners)
        ? (raffle.winners as any[])
        : [];
      return {
        ...raffle,
        totalEntries: entries.length,
        totalWinners: winners.length,
      };
    });
  }

  /**
   * Get a single raffle by ID
   */
  async getRaffleById(raffleId: string) {
    const raffle = await this.prisma.raffle.findUnique({
      where: { raffleId },
      include: {
        tournament: {
          select: {
            tournamentId: true,
            name: true,
            gameTitle: true,
            status: true,
          },
        },
      },
    });

    if (!raffle) {
      throw new NotFoundException(`Raffle #${raffleId} not found`);
    }

    const entries = Array.isArray(raffle.entries)
      ? (raffle.entries as any[])
      : [];
    const winners = Array.isArray(raffle.winners)
      ? (raffle.winners as any[])
      : [];

    return {
      ...raffle,
      totalEntries: entries.length,
      totalWinners: winners.length,
    };
  }

  /**
   * Create a new raffle
   */
  async createRaffle(dto: CreateRaffleDto, targetTournamentId?: string) {
    const tournamentId = targetTournamentId || dto.tournamentId;
    if (!tournamentId) {
      throw new BadRequestException('Tournament ID is required');
    }

    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    return this.prisma.raffle.create({
      data: {
        tournamentId,
        name: dto.name,
        prizeDescription: dto.prizeDescription,
        numberOfWinners: dto.numberOfWinners || 1,
        drawDate: dto.drawDate ? new Date(dto.drawDate) : null,
        registrationCloseDate: dto.registrationCloseDate
          ? new Date(dto.registrationCloseDate)
          : null,
        entries: [],
        winners: [],
      },
    });
  }

  /**
   * Join a raffle as a Player or as a Fan
   */
  async joinRaffle(
    raffleId: string,
    currentUser: { userId: string; role?: string },
  ) {
    if (!currentUser?.userId) {
      throw new UnauthorizedException('Authentication token required');
    }

    const raffle = await this.prisma.raffle.findUnique({
      where: { raffleId },
      include: {
        tournament: {
          select: {
            tournamentId: true,
            name: true,
            status: true,
          },
        },
      },
    });

    if (!raffle) {
      throw new NotFoundException(`Raffle #${raffleId} not found`);
    }

    // 1. Raffle must be open
    if (raffle.status !== RaffleStatus.OPEN) {
      throw new BadRequestException('Raffle registration is not open');
    }

    // 2. Check if registration close date has passed
    if (
      raffle.registrationCloseDate &&
      new Date(raffle.registrationCloseDate) < new Date()
    ) {
      throw new BadRequestException('Raffle registration deadline has passed');
    }

    const entries = Array.isArray(raffle.entries)
      ? (raffle.entries as any[])
      : [];

    // 3. Prevent duplicate entry
    const alreadyJoined = entries.some(
      (e: any) => e.userId === currentUser.userId,
    );
    if (alreadyJoined) {
      throw new BadRequestException('You have already joined this raffle');
    }

    // 4. Resolve participant name and role (Player or Fan)
    let userType: 'PLAYER' | 'FAN' = 'FAN';
    let participantName = 'Participant';
    let gamerTag = '';

    const roleStr = String(currentUser.role || '').toUpperCase();
    const isPlayerRole = roleStr.includes('PLAYER');

    if (isPlayerRole) {
      const player = await this.prisma.player.findFirst({
        where: { playerId: currentUser.userId, isDeleted: false },
        select: {
          playerId: true,
          firstName: true,
          lastName: true,
          gamerTag: true,
        },
      });

      if (player) {
        userType = 'PLAYER';
        participantName = `${player.firstName} ${player.lastName}`.trim();
        gamerTag = player.gamerTag || '';
      }
    } else {
      const fan = await this.prisma.fan.findFirst({
        where: { fanId: currentUser.userId, isDeleted: false },
        select: {
          fanId: true,
          firstName: true,
          surname: true,
          gamerTag: true,
        },
      });

      if (fan) {
        userType = 'FAN';
        participantName = `${fan.firstName} ${fan.surname || ''}`.trim();
        gamerTag = fan.gamerTag || '';
      } else {
        // Fallback: check player table in case role wasn't explicitly set in token
        const player = await this.prisma.player.findFirst({
          where: { playerId: currentUser.userId, isDeleted: false },
          select: {
            playerId: true,
            firstName: true,
            lastName: true,
            gamerTag: true,
          },
        });

        if (player) {
          userType = 'PLAYER';
          participantName = `${player.firstName} ${player.lastName}`.trim();
          gamerTag = player.gamerTag || '';
        }
      }
    }

    // 5. Generate a unique ticket number
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const ticketNumber = `TICK-${raffleId.slice(-4).toUpperCase()}-${randomSuffix}`;

    const newEntry = {
      entryId: `entry-${Date.now()}-${randomSuffix}`,
      userId: currentUser.userId,
      userType,
      name: participantName,
      gamerTag,
      ticketNumber,
      joinedAt: new Date().toISOString(),
    };

    const updatedEntries = [...entries, newEntry];

    await this.prisma.raffle.update({
      where: { raffleId },
      data: {
        entries: updatedEntries as any,
      },
    });

    return {
      raffleId: raffle.raffleId,
      raffleName: raffle.name,
      prizeDescription: raffle.prizeDescription,
      ticketNumber,
      participantName,
      userType,
      joinedAt: newEntry.joinedAt,
      totalEntries: updatedEntries.length,
    };
  }

  /**
   * Draws random winners for a raffle from its entries.
   */
  async drawRaffle(raffleId: string, targetTournamentId?: string) {
    const whereClause: any = { raffleId };
    if (targetTournamentId) {
      whereClause.tournamentId = targetTournamentId;
    }

    const raffle = await this.prisma.raffle.findFirst({
      where: whereClause,
    });
    if (!raffle) {
      throw new NotFoundException(`Raffle #${raffleId} not found`);
    }

    const entries = Array.isArray(raffle.entries)
      ? (raffle.entries as any[])
      : [];
    if (entries.length === 0) {
      throw new BadRequestException('Cannot draw raffle: No entries found');
    }

    // Shuffle entries
    const shuffled = [...entries].sort(() => 0.5 - Math.random());
    const count = Math.min(raffle.numberOfWinners, shuffled.length);
    const winners = shuffled.slice(0, count).map((entry, index) => ({
      position: index + 1,
      userId: entry.userId,
      name: entry.name,
      ticketNumber: entry.ticketNumber,
      drawnAt: new Date().toISOString(),
    }));

    return this.prisma.raffle.update({
      where: { raffleId },
      data: {
        status: RaffleStatus.DRAWN,
        winners: winners as any,
      },
    });
  }

  /**
   * Delete a raffle
   */
  async deleteRaffle(raffleId: string) {
    const raffle = await this.prisma.raffle.findUnique({
      where: { raffleId },
    });
    if (!raffle) {
      throw new NotFoundException(`Raffle #${raffleId} not found`);
    }

    return this.prisma.raffle.delete({
      where: { raffleId },
    });
  }
}
