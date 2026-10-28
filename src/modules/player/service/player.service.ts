import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { CreatePlayerDto } from '../dto/create-player.dto';
import { UpdatePlayerDto } from '../dto/update-player.dto';
import { UpdateDocumentStatusDto } from '../dto/update-document-status.dto';
import { RequestPayoutDto } from '../dto/request-payout.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import {
  buildPrismaQuery,
  calculatePaginationMeta,
  QueryOptions,
} from '../../utils/query.util';
import { deleteImageFromS3 } from '../../utils/s3.util';
import { generatePlayerId } from '../utils/generate-id.util';
import { createActivities } from '../../utils/activity.util';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../../mail/mail.service';
import { formatPlayerResponse } from '../utils/player-response.util';
import { DocumentStatus, Role } from '@prisma/client';
import { PlayerDocumentService } from './player-document.service';
import { PlayerPassService } from './player-pass.service';
import { PlayerWalletService } from './player-wallet.service';

@Injectable()
export class PlayerService {
  private readonly logger = new Logger(PlayerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly documentService: PlayerDocumentService,
    private readonly passService: PlayerPassService,
    private readonly walletService: PlayerWalletService,
  ) {}

  /**
   * Create a new player account with optional profile picture and compliance documents.
   */
  async createPlayer(
    createPlayerDto: CreatePlayerDto,
    profilePictureKey?: string,
    documentKeys?: string[],
  ) {
    const existingPlayer = await this.prisma.player.findUnique({
      where: { email: createPlayerDto.email },
    });

    if (existingPlayer) {
      if (existingPlayer.isDeleted) {
        const token = await this.jwtService.signAsync(
          { sub: existingPlayer.playerId, email: existingPlayer.email },
          {
            secret: process.env.JWT_SECRET,
            expiresIn: (process.env.RECOVERY_TOKEN_EXPIRATION || '15m') as any,
          },
        );
        await this.mailService.sendRecoveryLink(
          existingPlayer.email,
          token,
          existingPlayer.firstName,
        );
        throw new ConflictException(
          'This account has been deactivated. A recovery link has been sent to your email.',
        );
      }
      throw new ConflictException('Player with this email already exists');
    }

    const {
      password,
      documents,
      profilePicture,
      dateOfBirth,
      gamertag,
      gamerTag,
      ...rest
    } = createPlayerDto;

    const normalizedGamerTag = gamerTag || gamertag;
    if (normalizedGamerTag) {
      const tagExists = await this.prisma.player.findFirst({
        where: { gamerTag: normalizedGamerTag },
      });
      if (tagExists) {
        throw new ConflictException('This Gamer Tag is already in use');
      }
    }

    let parsedDob: Date | undefined = undefined;
    if (dateOfBirth) {
      const parsed = new Date(dateOfBirth);
      if (isNaN(parsed.getTime())) {
        throw new BadRequestException(
          'Invalid dateOfBirth format. Please use ISO format YYYY-MM-DD.',
        );
      }
      parsedDob = parsed;
    }

    const hashedPassword = await bcrypt.hash(
      password,
      Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
    );
    const showPlayerId = await generatePlayerId(this.prisma);
    const initialDocs = documentKeys || [];

    const newPlayer = await this.prisma.$transaction(async (tx) => {
      const created = await tx.player.create({
        data: {
          ...rest,
          password: hashedPassword,
          showPlayerId,
          gamerTag: normalizedGamerTag,
          profilePicture: profilePictureKey || null,
          dateOfBirth: parsedDob || null,
          document: initialDocs,
        },
      });

      if (initialDocs.length > 0) {
        await tx.playerDocument.createMany({
          data: initialDocs.map((url) => ({
            playerId: created.playerId,
            type: 'Government ID',
            url,
            status: DocumentStatus.PENDING,
          })),
        });
      }

      // Initialize compliant wallet ledger account atomically
      await tx.wallet.create({
        data: {
          playerId: created.playerId,
          userId: created.playerId,
          userRole: 'PLAYER',
          cashBalance: 0.0,
          creditBalance: 0.0,
          escrowBalance: 0.0,
          currency: 'NGN',
        },
      });

      return tx.player.findUnique({
        where: { playerId: created.playerId },
        include: { documents: true },
      });
    });

    const title = 'Player Creation';
    const description = `Player ${newPlayer?.firstName} ${newPlayer?.lastName} (${newPlayer?.email}) was successfully created.`;
    await createActivities(this.prisma, title, description, 'PLAYER');

    return formatPlayerResponse(newPlayer);
  }

  /**
   * Update Player Profile / Settings.
   * Performs authorization verification (IDOR protection), sanitization of sensitive fields,
   * uniqueness checks, and delegates document synchronization to PlayerDocumentService.
   */
  async updatePlayer(
    id: string,
    updatePlayerDto: UpdatePlayerDto,
    newProfilePictureKey?: string,
    newDocumentKeys?: string[],
    requestingUser?: { userId: string; role: string },
  ) {
    const existingPlayer = await this.prisma.player.findUnique({
      where: { playerId: id },
      include: { documents: true },
    });

    if (!existingPlayer || existingPlayer.isDeleted) {
      throw new NotFoundException('Player not found or account is deactivated');
    }

    // Authorization & Ownership Verification (Strict IDOR protection)
    const isAdmin =
      requestingUser?.role === Role.ADMIN ||
      requestingUser?.role === Role.SUPER_ADMIN ||
      requestingUser?.role === 'admin' ||
      requestingUser?.role === 'super_admin';

    if (requestingUser) {
      const isSelf = requestingUser.userId === id;
      if (!isSelf && !isAdmin) {
        this.logger.warn(
          `Security violation: User ${requestingUser.userId} attempted unauthorized profile update on Player ${id}`,
        );
        throw new ForbiddenException(
          'You do not have permission to modify this player profile.',
        );
      }
    }

    // Email Uniqueness Check
    if (
      updatePlayerDto.email &&
      updatePlayerDto.email.toLowerCase() !== existingPlayer.email.toLowerCase()
    ) {
      const emailTaken = await this.prisma.player.findUnique({
        where: { email: updatePlayerDto.email.toLowerCase() },
      });
      if (emailTaken && emailTaken.playerId !== id) {
        throw new ConflictException('Email is already in use by another account');
      }
    }

    // Username Uniqueness Check
    if (
      updatePlayerDto.username &&
      updatePlayerDto.username !== existingPlayer.username
    ) {
      const usernameTaken = await this.prisma.player.findFirst({
        where: { username: updatePlayerDto.username },
      });
      if (usernameTaken && usernameTaken.playerId !== id) {
        throw new ConflictException('This username is already taken');
      }
    }

    // GamerTag Uniqueness Check
    const targetGamerTag = updatePlayerDto.gamerTag || updatePlayerDto.gamertag;
    if (targetGamerTag && targetGamerTag !== existingPlayer.gamerTag) {
      const gamerTagTaken = await this.prisma.player.findFirst({
        where: { gamerTag: targetGamerTag },
      });
      if (gamerTagTaken && gamerTagTaken.playerId !== id) {
        throw new ConflictException('This Gamer Tag is already taken');
      }
    }

    // Full Name Parsing
    let resolvedFirstName = updatePlayerDto.firstName;
    let resolvedLastName = updatePlayerDto.lastName;
    if (updatePlayerDto.fullName) {
      const parts = updatePlayerDto.fullName.trim().split(/\s+/);
      if (parts.length > 0) {
        resolvedFirstName = parts[0];
        resolvedLastName =
          parts.slice(1).join(' ') || existingPlayer.lastName || parts[0];
      }
    }

    const resolvedPhoneNumber =
      updatePlayerDto.phoneNumber || updatePlayerDto.phone;

    let parsedDob: Date | undefined = undefined;
    if (updatePlayerDto.dateOfBirth) {
      const parsed = new Date(updatePlayerDto.dateOfBirth);
      if (isNaN(parsed.getTime())) {
        throw new BadRequestException(
          'Invalid date of birth format. Please use YYYY-MM-DD.',
        );
      }
      parsedDob = parsed;
    }

    // Profile Picture Management
    let updatedProfilePicture = existingPlayer.profilePicture;
    let oldPictureToDelete: string | null = null;

    if (newProfilePictureKey) {
      if (existingPlayer.profilePicture) {
        oldPictureToDelete = existingPlayer.profilePicture;
      }
      updatedProfilePicture = newProfilePictureKey;
    } else if (updatePlayerDto.deleteProfilePicture) {
      if (existingPlayer.profilePicture) {
        oldPictureToDelete = existingPlayer.profilePicture;
      }
      updatedProfilePicture = null;
    }

    // Delegate document reconciliation to PlayerDocumentService
    let docsToDeleteFromS3: string[] = [];

    const updatedPlayerRecord = await this.prisma.$transaction(async (tx) => {
      const { updatedLegacyDocumentList, documentsToDeleteFromS3 } =
        await this.documentService.reconcileDocumentsInTx(
          tx,
          existingPlayer,
          updatePlayerDto,
          newDocumentKeys,
        );

      docsToDeleteFromS3 = documentsToDeleteFromS3;

      return tx.player.update({
        where: { playerId: id },
        data: {
          ...(resolvedFirstName ? { firstName: resolvedFirstName } : {}),
          ...(resolvedLastName ? { lastName: resolvedLastName } : {}),
          ...(updatePlayerDto.email ? { email: updatePlayerDto.email } : {}),
          ...(updatePlayerDto.username
            ? { username: updatePlayerDto.username }
            : {}),
          ...(targetGamerTag ? { gamerTag: targetGamerTag } : {}),
          ...(updatePlayerDto.surname
            ? { surname: updatePlayerDto.surname }
            : {}),
          ...(resolvedPhoneNumber
            ? { phoneNumber: resolvedPhoneNumber }
            : {}),
          ...(parsedDob ? { dateOfBirth: parsedDob } : {}),
          profilePicture: updatedProfilePicture,
          document: updatedLegacyDocumentList,
        },
        include: {
          documents: true,
          registrationHistory: true,
          marketingData: true,
        },
      });
    });

    // Cleanup S3 storage asynchronously after successful DB commit
    if (oldPictureToDelete) {
      void deleteImageFromS3(this.documentService.extractKey(oldPictureToDelete));
    }
    if (docsToDeleteFromS3.length > 0) {
      void Promise.all(
        docsToDeleteFromS3.map((key) => deleteImageFromS3(key)),
      );
    }

    return formatPlayerResponse(updatedPlayerRecord);
  }

  /**
   * Retrieve Player by ID with formatted response.
   */
  async getPlayerById(id: string) {
    if (!id) {
      throw new BadRequestException('Player ID is required');
    }

    const player = await this.prisma.player.findUnique({
      where: { playerId: id },
      include: {
        documents: true,
        registrationHistory: true,
        marketingData: true,
      },
    });

    if (!player || player.isDeleted) {
      throw new NotFoundException('Player not found');
    }

    return formatPlayerResponse(player);
  }

  /**
   * Paginated Player search and listing.
   */
  async getAllPlayer(query: QueryOptions = {}) {
    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      ['firstName', 'lastName', 'email', 'showPlayerId', 'phoneNumber', 'gamerTag'],
    );

    where.isDeleted = false;

    const [data, total] = await Promise.all([
      this.prisma.player.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          documents: true,
        },
      }),
      this.prisma.player.count({ where }),
    ]);

    const formattedData = await Promise.all(
      data.map((player) => formatPlayerResponse(player)),
    );

    const meta = calculatePaginationMeta(total, page, limit);

    return { data: formattedData, meta };
  }

  /**
   * Recover deactivated player account.
   */
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

      const updated = await this.prisma.player.update({
        where: { playerId: player.playerId },
        data: {
          isDeleted: false,
        },
        include: { documents: true },
      });

      return formatPlayerResponse(updated);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new ConflictException('Recovery link has expired');
      }
      throw new ConflictException('Invalid recovery link');
    }
  }

  /**
   * Soft-delete Player (Admin only).
   */
  async deletePlayer(id: string) {
    const player = await this.prisma.player.findUnique({
      where: { playerId: id },
    });

    if (!player || player.isDeleted) {
      throw new NotFoundException('Player not found or already deleted');
    }

    const updated = await this.prisma.player.update({
      where: { playerId: id },
      data: {
        isDeleted: true,
      },
    });

    return { message: 'Player account successfully deactivated', id: updated.playerId };
  }

  /**
   * Unified Competitor Dashboard Overview.
   * Powers the Competitor Dashboard (Discover), compliance status, next scheduled showdown,
   * registered cups, live performance records, and active cup raffles in a single high-performance query.
   */
  async getPlayerDashboard(playerId: string) {
    if (!playerId) {
      throw new BadRequestException('Player ID is required');
    }

    const [player, wallet, registrations] = await Promise.all([
      this.prisma.player.findUnique({
        where: { playerId },
        include: { documents: true },
      }),
      this.walletService.getWalletBalance(playerId),
      this.prisma.tournamentRegistration.findMany({
        where: { playerId },
        include: {
          tournament: {
            include: {
              venues: {
                include: { screens: true },
              },
              sponsors: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!player || player.isDeleted) {
      throw new NotFoundException('Player not found or account is deactivated');
    }

    const formattedProfile = await formatPlayerResponse(player);

    const registeredTournamentIds = registrations
      .map((r) => r.tournamentId)
      .filter(Boolean);

    // Fetch raffles across player's registered tournaments
    let availableRaffles: any[] = [];
    if (registeredTournamentIds.length > 0) {
      const dbRaffles = await this.prisma.raffle.findMany({
        where: {
          tournamentId: { in: registeredTournamentIds },
        },
        include: {
          tournament: {
            select: { tournamentId: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      availableRaffles = dbRaffles.map((r) => {
        const entries = Array.isArray(r.entries) ? (r.entries as any[]) : [];
        const winners = Array.isArray(r.winners) ? (r.winners as any[]) : [];
        const isJoined = entries.some((e: any) => e.userId === playerId);
        const myWin = winners.find((w: any) => w.userId === playerId) || null;

        return {
          raffleId: r.raffleId,
          name: r.name,
          prizeDescription: r.prizeDescription,
          status: r.status,
          tournamentId: r.tournamentId,
          tournamentName: r.tournament?.name || 'Tournament',
          totalEntries: entries.length,
          isJoined,
          myWin: myWin
            ? {
                ticketNumber: myWin.ticketNumber,
                qrCodeString: myWin.qrCodeString,
                drawDate: myWin.drawDate,
              }
            : null,
        };
      });
    }

    // Process canonical matches across active tournaments for this player
    const upcomingMatches: any[] = [];
    const completedMatches: any[] = [];
    let winsCount = 0;
    let lossesCount = 0;

    const opponentIds = new Set<string>();

    for (const reg of registrations) {
      const tourney = reg.tournament;
      if (!tourney || tourney.isDeleted) continue;

      const schedule = (tourney.schedule as any) || {};
      const matches: any[] =
        schedule.structure?.matches || schedule.matches || [];

      for (const m of matches) {
        if (m.player1Id === playerId || m.player2Id === playerId) {
          const isPlayer1 = m.player1Id === playerId;
          const opponentId = isPlayer1 ? m.player2Id : m.player1Id;
          if (
            opponentId &&
            !opponentId.startsWith('TBD') &&
            !opponentId.startsWith('BYE')
          ) {
            opponentIds.add(opponentId);
          }

          const isCompleted =
            m.status === 'COMPLETED' ||
            (m.score1 !== undefined &&
              m.score2 !== undefined &&
              m.score1 !== null &&
              m.score2 !== null &&
              (m.score1 > 0 || m.score2 > 0));

          if (isCompleted) {
            completedMatches.push({
              matchId: m.id || m.canonicalMatchId,
              tournamentId: tourney.tournamentId,
              tournamentName: tourney.name,
              round: m.round,
              playerScore: isPlayer1 ? m.score1 : m.score2,
              opponentScore: isPlayer1 ? m.score2 : m.score1,
              opponentId,
              winnerId: m.winnerId,
              isWinner: m.winnerId === playerId,
              date: m.date,
              time: m.time,
              venueName: m.venueName,
            });

            if (
              m.winnerId === playerId ||
              (isPlayer1 && m.score1 > m.score2) ||
              (!isPlayer1 && m.score2 > m.score1)
            ) {
              winsCount++;
            } else if (opponentId) {
              lossesCount++;
            }
          } else {
            const hasSchedule = Boolean(m.date && m.time);
            upcomingMatches.push({
              matchId: m.id || m.canonicalMatchId,
              tournamentId: tourney.tournamentId,
              tournamentName: tourney.name,
              gameTitle: tourney.gameTitle,
              round: m.round,
              opponentId,
              date: m.date || null,
              time: m.time || null,
              venueId: m.venueId || null,
              venueName: m.venueName || 'Main Arena',
              screenId: m.screenId || null,
              screenName: m.screenName || 'Screen 1',
              isScheduled: hasSchedule,
              schedulingMode: tourney.schedulingMode,
              canSelfSchedule:
                tourney.schedulingMode === 'PLAYER_SELF' &&
                !tourney.schedulingPaused &&
                (tourney as any).schedulingWindowOpen !== false,
            });
          }
        }
      }
    }

    // Resolve opponent handles
    const opponentMap: Record<string, { gamertag: string; fullName: string }> =
      {};
    if (opponentIds.size > 0) {
      const opponents =
        (await this.prisma.player.findMany({
          where: { playerId: { in: Array.from(opponentIds) } },
          select: {
            playerId: true,
            gamerTag: true,
            firstName: true,
            lastName: true,
          },
        })) || [];
      if (Array.isArray(opponents)) {
        for (const opp of opponents) {
          opponentMap[opp.playerId] = {
            gamertag: opp.gamerTag || 'Competitor',
            fullName: `${opp.firstName || ''} ${opp.lastName || ''}`.trim(),
          };
        }
      }
    }

    // Populate opponent details
    for (const match of [...upcomingMatches, ...completedMatches]) {
      if (match.opponentId && opponentMap[match.opponentId]) {
        match.opponentGamertag = opponentMap[match.opponentId].gamertag;
        match.opponentName = opponentMap[match.opponentId].fullName;
      } else {
        match.opponentGamertag = match.opponentId || 'Awaiting Competitor';
        match.opponentName = match.opponentId || 'Awaiting Competitor';
      }
    }

    // Next scheduled showdown
    const scheduledUpcoming = upcomingMatches
      .filter((m) => m.isScheduled)
      .sort((a, b) => {
        const da = new Date(`${a.date}T${a.time || '00:00'}`).getTime();
        const db = new Date(`${b.date}T${b.time || '00:00'}`).getTime();
        return da - db;
      });

    const nextMatch =
      scheduledUpcoming.length > 0 ? scheduledUpcoming[0] : null;

    // Active registered cups list
    const activeCups = registrations.map((r) => {
      const t = r.tournament;
      return {
        registrationId: r.registrationId,
        tournamentId: r.tournamentId,
        tournamentName: t?.name,
        gameTitle: t?.gameTitle,
        format: t?.tournamentFormat,
        status: r.status,
        paymentStatus: r.paymentStatus,
        paymentDeadline: r.paymentDeadline,
        assignedSlot: r.assignedSlot,
        qrCodeString: r.qrCodeString,
        isPassAvailable: r.status === 'CONFIRMED',
        canRebook:
          t?.schedulingMode === 'PLAYER_SELF' &&
          !t?.schedulingPaused &&
          (t as any)?.schedulingWindowOpen !== false,
      };
    });

    const totalMatchesPlayed = winsCount + lossesCount;
    const winRate =
      totalMatchesPlayed > 0
        ? Math.round((winsCount / totalMatchesPlayed) * 100)
        : 0;

    return {
      profile: formattedProfile,
      wallet,
      nextMatch,
      activeCups,
      upcomingMatches: scheduledUpcoming,
      raffles: availableRaffles,
      performanceRecords: {
        wins: winsCount,
        losses: lossesCount,
        matchesPlayed: totalMatchesPlayed,
        winRatePercent: winRate,
      },
    };
  }

  /**
   * Dedicated Player Matches Endpoint:
   * Categorizes matches into upcoming, unscheduled, and completed.
   */
  async getPlayerMatches(
    playerId: string,
    filter?: {
      tournamentId?: string;
      status?: string;
      page?: number | string;
      limit?: number | string;
    },
  ) {
    if (!playerId) {
      throw new BadRequestException('Player ID is required');
    }

    const whereClause: any = { playerId };
    if (filter?.tournamentId) {
      whereClause.tournamentId = filter.tournamentId;
    }

    const registrations = await this.prisma.tournamentRegistration.findMany({
      where: whereClause,
      include: {
        tournament: {
          include: {
            venues: {
              include: { screens: true },
            },
          },
        },
      },
    });

    const upcoming: any[] = [];
    const unscheduled: any[] = [];
    const completed: any[] = [];

    const opponentIds = new Set<string>();

    for (const reg of registrations) {
      const tourney = reg.tournament;
      if (!tourney || tourney.isDeleted) continue;

      const schedule = (tourney.schedule as any) || {};
      const matches: any[] =
        schedule.structure?.matches || schedule.matches || [];

      for (const m of matches) {
        if (m.player1Id === playerId || m.player2Id === playerId) {
          const isPlayer1 = m.player1Id === playerId;
          const opponentId = isPlayer1 ? m.player2Id : m.player1Id;
          if (
            opponentId &&
            !opponentId.startsWith('TBD') &&
            !opponentId.startsWith('BYE')
          ) {
            opponentIds.add(opponentId);
          }

          const isCompleted =
            m.status === 'COMPLETED' ||
            (m.score1 !== undefined &&
              m.score2 !== undefined &&
              m.score1 !== null &&
              m.score2 !== null &&
              (m.score1 > 0 || m.score2 > 0));

          if (isCompleted) {
            completed.push({
              matchId: m.id || m.canonicalMatchId,
              tournamentId: tourney.tournamentId,
              tournamentName: tourney.name,
              gameTitle: tourney.gameTitle,
              round: m.round,
              playerScore: isPlayer1 ? m.score1 : m.score2,
              opponentScore: isPlayer1 ? m.score2 : m.score1,
              opponentId,
              winnerId: m.winnerId,
              isWinner: m.winnerId === playerId,
              date: m.date,
              time: m.time,
              venueName: m.venueName,
            });
          } else if (m.date && m.time) {
            upcoming.push({
              matchId: m.id || m.canonicalMatchId,
              tournamentId: tourney.tournamentId,
              tournamentName: tourney.name,
              gameTitle: tourney.gameTitle,
              round: m.round,
              opponentId,
              date: m.date,
              time: m.time,
              venueId: m.venueId,
              venueName: m.venueName,
              screenId: m.screenId,
              screenName: m.screenName,
              schedulingMode: tourney.schedulingMode,
            });
          } else {
            unscheduled.push({
              matchId: m.id || m.canonicalMatchId,
              tournamentId: tourney.tournamentId,
              tournamentName: tourney.name,
              gameTitle: tourney.gameTitle,
              round: m.round,
              opponentId,
              schedulingMode: tourney.schedulingMode,
              canSelfSchedule:
                tourney.schedulingMode === 'PLAYER_SELF' &&
                !tourney.schedulingPaused &&
                (tourney as any).schedulingWindowOpen !== false,
            });
          }
        }
      }
    }

    // Resolve opponent info
    if (opponentIds.size > 0) {
      const opponents =
        (await this.prisma.player.findMany({
          where: { playerId: { in: Array.from(opponentIds) } },
          select: {
            playerId: true,
            gamerTag: true,
            firstName: true,
            lastName: true,
          },
        })) || [];
      const oppMap = new Map(
        Array.isArray(opponents) ? opponents.map((o) => [o.playerId, o]) : [],
      );

      for (const m of [...upcoming, ...unscheduled, ...completed]) {
        if (m.opponentId && oppMap.has(m.opponentId)) {
          const opp = oppMap.get(m.opponentId)!;
          m.opponentGamertag = opp.gamerTag || 'Competitor';
          m.opponentName = `${opp.firstName || ''} ${opp.lastName || ''}`.trim();
        } else {
          m.opponentGamertag = m.opponentId || 'Competitor';
          m.opponentName = m.opponentId || 'Competitor';
        }
      }
    }

    const totalMatches = upcoming.length + unscheduled.length + completed.length;
    let pagination: any = undefined;

    if (filter?.page !== undefined || filter?.limit !== undefined) {
      const page = Math.max(1, Number(filter?.page) || 1);
      const limit = Math.max(1, Number(filter?.limit) || 20);
      const skip = (page - 1) * limit;

      const normStatus = filter?.status?.toUpperCase();
      let targetListTotal = totalMatches;
      if (normStatus === 'UPCOMING') targetListTotal = upcoming.length;
      else if (normStatus === 'UNSCHEDULED') targetListTotal = unscheduled.length;
      else if (normStatus === 'COMPLETED') targetListTotal = completed.length;

      pagination = {
        total: targetListTotal,
        page,
        limit,
        totalPages: Math.ceil(targetListTotal / limit),
      };

      if (normStatus === 'UPCOMING') {
        return {
          upcoming: upcoming.slice(skip, skip + limit),
          unscheduled: [],
          completed: [],
          pagination,
          meta: pagination,
        };
      }
      if (normStatus === 'UNSCHEDULED') {
        return {
          upcoming: [],
          unscheduled: unscheduled.slice(skip, skip + limit),
          completed: [],
          pagination,
          meta: pagination,
        };
      }
      if (normStatus === 'COMPLETED') {
        return {
          upcoming: [],
          unscheduled: [],
          completed: completed.slice(skip, skip + limit),
          pagination,
          meta: pagination,
        };
      }
    }

    return {
      upcoming,
      unscheduled,
      completed,
      pagination,
      meta: pagination,
    };
  }

  // ---------------------------------------------------------------------------
  // Facade delegations for backwards-compatibility with existing tests and code
  // ---------------------------------------------------------------------------

  async updateDocumentStatus(playerId: string, documentId: string, dto: UpdateDocumentStatusDto) {
    return this.documentService.updateDocumentStatus(playerId, documentId, dto);
  }

  async deleteDocument(playerId: string, documentId: string) {
    return this.documentService.deleteDocument(playerId, documentId);
  }

  async getMyPasses(
    playerId: string,
    query?: { page?: number | string; limit?: number | string },
  ) {
    return this.passService.getMyPasses(playerId, query);
  }

  async getPassByTournament(playerId: string, tournamentId: string) {
    return this.passService.getPassByTournament(playerId, tournamentId);
  }

  async getWalletBalance(playerId: string) {
    return this.walletService.getWalletBalance(playerId);
  }

  async getLedgerHistory(
    playerId: string,
    options?: number | { page?: number | string; limit?: number | string },
  ) {
    return this.walletService.getLedgerHistory(playerId, options);
  }

  async requestPayout(playerId: string, dto: RequestPayoutDto) {
    return this.walletService.requestPayout(playerId, dto);
  }
}
