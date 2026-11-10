import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateRaffleDto } from '../dto/tournament/create-raffle.dto';
import { RaffleStatus } from '@prisma/client';
import * as crypto from 'crypto';
import {
  buildPrismaQuery,
  calculatePaginationMeta,
  QueryOptions,
} from '../../utils/query.util';
import { parseRaffleRegistrationCloseDate } from '../utils/raffle-date.util';
import { NotificationService } from '../../notification/notification.service';

@Injectable()
export class RaffleService {
  private readonly logger = new Logger(RaffleService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

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
        winners: winners.map(({ qrCodeString, ...winner }) => ({
          ...winner,
          claimAvailable: Boolean(qrCodeString),
        })),
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
        winners: winners.map(({ qrCodeString, ...winner }) => ({
          ...winner,
          claimAvailable: Boolean(qrCodeString),
        })),
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
      winners: winners.map(({ qrCodeString, ...winner }) => ({
        ...winner,
        claimAvailable: Boolean(qrCodeString),
      })),
      totalEntries: entries.length,
      totalWinners: winners.length,
    };
  }

  /**
   * Return only the raffles the authenticated participant entered. Winner and
   * ticket data are filtered to that participant so this endpoint does not
   * expose other fans' private entry details.
   */
  async getMyRaffles(userId: string, role?: string) {
    if (!userId) {
      throw new BadRequestException('Authenticated user ID is required');
    }

    const expectedUserType = String(role || '').toUpperCase().includes('PLAYER')
      ? 'PLAYER'
      : 'FAN';

    const raffles = await this.prisma.raffle.findMany({
      include: {
        tournament: {
          select: {
            tournamentId: true,
            name: true,
            gameTitle: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return raffles
      .map((raffle) => {
        const entries = Array.isArray(raffle.entries)
          ? (raffle.entries as any[])
          : [];
        const winners = Array.isArray(raffle.winners)
          ? (raffle.winners as any[])
          : [];
        const myEntries = entries.filter(
          (entry) =>
            entry.userId === userId &&
            (!entry.userType || entry.userType === expectedUserType),
        );
        const myWinners = winners.filter(
          (winner) =>
            winner.userId === userId &&
            (!winner.userType || winner.userType === expectedUserType),
        );

        if (myEntries.length === 0 && myWinners.length === 0) return null;

        return {
          ...raffle,
          entries: myEntries,
          winners: myWinners,
          totalEntries: entries.length,
          totalWinners: winners.length,
          isWinner: myWinners.length > 0,
        };
      })
      .filter(Boolean);
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
          ? parseRaffleRegistrationCloseDate(dto.registrationCloseDate)
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
      new Date(raffle.registrationCloseDate) <= new Date()
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

    // 4. Resolve participant name and role (Player or Fan). Do not create
    // anonymous entries: a raffle entry must always belong to a real account.
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

    if (participantName === 'Participant') {
      throw new BadRequestException(
        'Only an active fan or player account can join this raffle',
      );
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

    const existingWinners = Array.isArray(raffle.winners)
      ? (raffle.winners as any[])
      : [];

    // A completed draw is immutable once its winner payload is persisted.
    // Older records may have DRAWN status without winners; those records are
    // allowed to complete once so the result is not permanently blank.
    if (raffle.status === RaffleStatus.DRAWN && existingWinners.length > 0) {
      return raffle;
    }

    if (raffle.status === RaffleStatus.CANCELLED) {
      throw new BadRequestException('A cancelled raffle cannot be drawn');
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
    const drawnAt = new Date().toISOString();
    const winners = shuffled.slice(0, count).map((entry, index) => ({
      position: index + 1,
      userId: entry.userId,
      userType: entry.userType,
      name: entry.name,
      gamerTag: entry.gamerTag || '',
      ticketNumber: entry.ticketNumber,
      drawnAt,
      wonAt: drawnAt,
      redeemed: false,
      // Unpredictable claim token; the scanner validates and consumes it once.
      qrCodeString: `RAFFLE:${raffle.raffleId}:${crypto.randomBytes(32).toString('base64url')}`,
    }));

    const updatedRaffle = await this.prisma.raffle.update({
      where: { raffleId },
      data: {
        status: RaffleStatus.DRAWN,
        winners: winners as any,
      },
    });

    if (this.notificationService) {
      const notificationResults = await Promise.allSettled(
        winners.map((winner) =>
          this.notificationService!.create({
            userId: winner.userId,
            status: 'ALERT',
            title: `You won: ${raffle.name}`,
            description: `You won the ${raffle.name} giveaway. Prize: ${raffle.prizeDescription}. Open Giveaways to view your result and claim details.`,
          }),
        ),
      );
      notificationResults.forEach((result) => {
        if (result.status === 'rejected') {
          this.logger.warn(`Could not create raffle winner notification: ${String(result.reason)}`);
        }
      });
    }

    return updatedRaffle;
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
