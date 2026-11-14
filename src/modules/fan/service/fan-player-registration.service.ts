import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  FanTournamentApplicationStatus,
  TournamentRegistrationStatus,
  TournamentStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { PlayerService } from '../../player/service/player.service';
import { FlutterwaveService } from '../../flutterwave/service/flutterwave.service';
import { uploadBase64ToS3 } from '../../utils/s3.util';
import { CompleteFanTournamentApplicationDto } from '../dto/complete-fan-tournament-application.dto';
import { CreateFanTournamentApplicationDto } from '../dto/create-fan-tournament-application.dto';
import { FOOTBALL_CLUB_CATALOG } from '../data/football-club-catalog.data';

@Injectable()
export class FanPlayerRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly flutterwave: FlutterwaveService,
    private readonly playerService: PlayerService,
  ) {}

  private async createPlayerSession(player: any) {
    const tokenPayload = {
      userId: player.playerId,
      email: player.email,
      role: 'player',
    };
    const accessToken = await this.jwtService.signAsync(tokenPayload);
    const refreshToken = await this.jwtService.signAsync(tokenPayload, {
      secret:
        this.configService.get<string>('JWT_REFRESH_SECRET') ||
        'default_refresh_secret_key',
      expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ||
        '30d') as any,
    });
    const { password: _password, ...safePlayer } = player;
    const fullName = `${player.firstName} ${player.lastName}`.trim();

    return {
      player: {
        ...safePlayer,
        id: player.playerId,
        fullName,
        gamertag: player.gamerTag,
        phone: player.phoneNumber,
      },
      accessToken,
      refreshToken,
      user: {
        userId: player.playerId,
        email: player.email,
        name: fullName,
        role: 'player',
      },
    };
  }

  async createTournamentApplication(
    fanId: string,
    tournamentId: string,
    dto: CreateFanTournamentApplicationDto,
    requestOrigin?: string,
  ) {
    const [fan, tournament] = await Promise.all([
      this.prisma.fan.findUnique({ where: { fanId } }),
      this.prisma.tournament.findUnique({ where: { tournamentId } }),
    ]);
    if (!fan || fan.isDeleted || fan.status !== 'ACTIVE') {
      throw new NotFoundException('Active fan account not found.');
    }
    const existingPlayerAccount = await this.prisma.player.findFirst({
      where: {
        email: { equals: fan.email, mode: 'insensitive' },
        isDeleted: false,
      },
      select: { playerId: true },
    });
    if (existingPlayerAccount) {
      throw new ConflictException(
        'You already have a Player account. Use that account to register for tournaments.',
      );
    }
    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found.');
    }
    if (
      !tournament.registrationOpen &&
      tournament.status !== TournamentStatus.REGISTRATION_OPEN
    ) {
      throw new BadRequestException('Registration is closed for this tournament.');
    }

    const footballGame = tournament.gameType === 'FOOTBALL';
    if (footballGame) {
      if (!dto.primaryTeamId || !dto.secondaryTeamId) {
        throw new BadRequestException(
          'Choose both a primary and a backup team for this football tournament.',
        );
      }
      const isValidClub = (club: string, country?: string, competition?: string) =>
        FOOTBALL_CLUB_CATALOG.some(
          (entry) =>
            entry.club.toLocaleLowerCase() === club.trim().toLocaleLowerCase() &&
            entry.country.toLocaleLowerCase() === country?.trim().toLocaleLowerCase() &&
            entry.competition.toLocaleLowerCase() === competition?.trim().toLocaleLowerCase(),
        );
      if (
        !isValidClub(dto.primaryTeamId, dto.primaryTeamCountry, dto.primaryTeamCompetition) ||
        !isValidClub(dto.secondaryTeamId, dto.secondaryTeamCountry, dto.secondaryTeamCompetition)
      ) {
        throw new BadRequestException('Choose each club from its selected country and competition.');
      }
      if (dto.primaryTeamId.trim() === dto.secondaryTeamId.trim()) {
        throw new BadRequestException('Primary and backup teams must be different.');
      }
    }

    if (dto.homeVenueId) {
      const venue = await this.prisma.venue.findFirst({
        where: { venueId: dto.homeVenueId, tournamentId },
        select: { venueId: true },
      });
      if (!venue) {
        throw new BadRequestException(
          'Choose a venue belonging to the selected tournament.',
        );
      }
    }

    if (tournament.requireJerseySize && !dto.jerseySize?.trim()) {
      throw new BadRequestException('A jersey size is required for this tournament.');
    }

    let application = await this.prisma.fanTournamentApplication.findUnique({
      where: { fanId_tournamentId: { fanId, tournamentId } },
    });
    if (application?.status === FanTournamentApplicationStatus.COMPLETED) {
      throw new ConflictException('This fan has already completed registration.');
    }
    if (application?.status === FanTournamentApplicationStatus.CANCELLED) {
      application = await this.prisma.fanTournamentApplication.update({
        where: { id: application.id },
        data: {
          status: FanTournamentApplicationStatus.PENDING_PAYMENT,
          homeVenueId: dto.homeVenueId || null,
          primaryTeamId: footballGame ? dto.primaryTeamId!.trim() : null,
          primaryTeamCountry: footballGame ? dto.primaryTeamCountry!.trim() : null,
          primaryTeamCompetition: footballGame ? dto.primaryTeamCompetition!.trim() : null,
          secondaryTeamId: footballGame ? dto.secondaryTeamId!.trim() : null,
          secondaryTeamCountry: footballGame ? dto.secondaryTeamCountry!.trim() : null,
          secondaryTeamCompetition: footballGame ? dto.secondaryTeamCompetition!.trim() : null,
          jerseySize: dto.jerseySize?.trim() || null,
        },
      });
    } else if (application) {
      application = await this.prisma.fanTournamentApplication.update({
        where: { id: application.id },
        data: {
          homeVenueId: dto.homeVenueId || null,
          primaryTeamId: footballGame ? dto.primaryTeamId!.trim() : null,
          primaryTeamCountry: footballGame ? dto.primaryTeamCountry!.trim() : null,
          primaryTeamCompetition: footballGame ? dto.primaryTeamCompetition!.trim() : null,
          secondaryTeamId: footballGame ? dto.secondaryTeamId!.trim() : null,
          secondaryTeamCountry: footballGame ? dto.secondaryTeamCountry!.trim() : null,
          secondaryTeamCompetition: footballGame ? dto.secondaryTeamCompetition!.trim() : null,
          jerseySize: dto.jerseySize?.trim() || null,
        },
      });
    } else {
      application = await this.prisma.fanTournamentApplication.create({
        data: {
          fanId,
          tournamentId,
          homeVenueId: dto.homeVenueId || null,
          primaryTeamId: footballGame ? dto.primaryTeamId!.trim() : null,
          primaryTeamCountry: footballGame ? dto.primaryTeamCountry!.trim() : null,
          primaryTeamCompetition: footballGame ? dto.primaryTeamCompetition!.trim() : null,
          secondaryTeamId: footballGame ? dto.secondaryTeamId!.trim() : null,
          secondaryTeamCountry: footballGame ? dto.secondaryTeamCountry!.trim() : null,
          secondaryTeamCompetition: footballGame ? dto.secondaryTeamCompetition!.trim() : null,
          jerseySize: dto.jerseySize?.trim() || null,
        },
      });
    }

    const settledPayment = await this.prisma.payment.findFirst({
      where: { applicationId: application.id, status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
    });
    if (settledPayment) {
      return {
        application,
        payment: settledPayment,
        checkout: null,
        requiresPayment: false,
      };
    }

    if (tournament.entryFee <= 0) {
      const payment = await this.prisma.payment.create({
        data: {
          applicationId: application.id,
          gateway: 'FREE',
          status: 'SUCCESS',
          amount: 0,
          currency: tournament.currency,
          paidAmount: 0,
          paidCurrency: tournament.currency,
          paidAt: new Date(),
          providerDetails: { reason: 'No entry fee' },
        },
      });
      return { application, payment, checkout: null, requiresPayment: false };
    }

    const txRef = `TAPE-APP-${application.id}-${randomUUID().slice(0, 8)}`;
    await this.prisma.payment.updateMany({
      where: { applicationId: application.id, gateway: 'FLUTTERWAVE', status: 'PENDING' },
      data: { status: 'ABANDONED' },
    });
    const payment = await this.prisma.payment.create({
      data: {
        applicationId: application.id,
        gateway: 'FLUTTERWAVE',
        status: 'PENDING',
        amount: tournament.entryFee,
        currency: tournament.currency,
        txRef,
        providerDetails: {
          purpose: 'FAN_TOURNAMENT_APPLICATION',
          applicationId: application.id,
          tournamentId,
          fanId,
        },
      },
    });

    try {
      const checkout = await this.flutterwave.initializePayment({
        email: fan.email,
        amount: payment.amount,
        currency: payment.currency,
        name: `${fan.firstName} ${fan.surname || ''}`.trim(),
        phoneNumber: fan.phoneNumber,
        redirectUrl: this.getTournamentPaymentRedirectUrl(tournamentId, requestOrigin),
        title: tournament.name,
        description: `Tournament entry for ${tournament.name}`,
        txRef,
        meta: {
          purpose: 'FAN_TOURNAMENT_APPLICATION',
          applicationId: application.id,
          tournamentId,
          fanId,
        },
      });
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          checkoutUrl: checkout.link,
          providerDetails: {
            ...(payment.providerDetails as Record<string, unknown>),
            checkoutUrl: checkout.link,
          },
        },
      });
      return { application, payment, checkout, requiresPayment: true };
    } catch (error) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });
      throw error;
    }

  }

  async getMyTournamentApplication(fanId: string, tournamentId: string) {
    const application = await this.prisma.fanTournamentApplication.findUnique({
      where: { fanId_tournamentId: { fanId, tournamentId } },
      include: {
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            gateway: true,
            status: true,
            amount: true,
            currency: true,
            txRef: true,
            checkoutUrl: true,
            paidAmount: true,
            paidCurrency: true,
            paidAt: true,
          },
        },
        registration: {
          select: { registrationId: true, status: true },
        },
        player: {
          select: {
            playerId: true,
            firstName: true,
            lastName: true,
            gamerTag: true,
          },
        },
      },
    });

    if (!application) return null;
    const { payments, ...applicationData } = application;
    return { application: applicationData, payment: payments[0] ?? null };
  }

  async getTournamentForPaymentReturn(fanId: string, txRef: string) {
    const normalizedTxRef = txRef?.trim();
    if (!normalizedTxRef) {
      throw new BadRequestException('A Flutterwave payment reference is required.');
    }

    const payment = await this.prisma.payment.findFirst({
      where: { txRef: normalizedTxRef, gateway: 'FLUTTERWAVE' },
      select: { applicationId: true },
    });
    if (!payment) {
      throw new NotFoundException('Flutterwave payment reference was not found.');
    }
    if (!payment.applicationId) {
      throw new NotFoundException('This payment reference is not a tournament application payment.');
    }

    const application = await this.prisma.fanTournamentApplication.findFirst({
      where: { id: payment.applicationId, fanId },
      select: { tournamentId: true },
    });
    if (!application) {
      throw new NotFoundException(
        'This payment reference is not linked to your fan account.',
      );
    }

    return { tournamentId: application.tournamentId };
  }

  private getTournamentPaymentRedirectUrl(tournamentId: string, requestOrigin?: string) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      this.configService.get<string>('app.frontendDomain');
    if (!frontendUrl) return undefined;

    let base = frontendUrl.replace(/\/+$/, '');
    if (requestOrigin) {
      try {
        const requested = new URL(requestOrigin);
        const configured = new URL(frontendUrl);
        const canonicalHost = (hostname: string) => hostname.replace(/^www\./i, '').toLowerCase();
        const sameSite = canonicalHost(requested.hostname) === canonicalHost(configured.hostname);
        const sameLocalHost = ['localhost', '127.0.0.1'].includes(requested.hostname) &&
          ['localhost', '127.0.0.1'].includes(configured.hostname);
        const secureProtocol = requested.protocol === 'https:' || sameLocalHost;
        if ((sameSite || sameLocalHost) && secureProtocol) {
          base = requested.origin;
        }
      } catch {
        // Ignore an invalid Origin and use the configured frontend URL.
      }
    }
    return `${base}/fan/tournaments/${encodeURIComponent(tournamentId)}?payment=flutterwave`;
  }

  async checkGamerTagAvailability(gamerTag: string) {
    const normalizedGamerTag = gamerTag?.trim();
    if (!normalizedGamerTag) {
      throw new BadRequestException('Enter a Gamer Tag to check availability.');
    }
    if (normalizedGamerTag.length > 40) {
      throw new BadRequestException('Gamer Tag must be 40 characters or fewer.');
    }

    const existingPlayer = await this.findPlayerByGamerTag(normalizedGamerTag);

    return { gamerTag: normalizedGamerTag, available: !existingPlayer };
  }

  private async findPlayerByGamerTag(gamerTag: string) {
    const rows = await this.prisma.$queryRaw<Array<{ playerId: string }>>`
      SELECT "playerId"
      FROM "Player"
      WHERE NULLIF(BTRIM("gamerTag"), '') IS NOT NULL
        AND LOWER(BTRIM("gamerTag")) = LOWER(${gamerTag.trim()})
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async verifyApplicationPayment(
    fanId: string,
    tournamentId: string,
    applicationId: string,
    txRef: string,
  ) {
    const application = await this.prisma.fanTournamentApplication.findFirst({
      where: { id: applicationId, fanId, tournamentId },
    });
    if (!application) {
      throw new NotFoundException('Tournament application not found.');
    }
    const payment = await this.prisma.payment.findFirst({
      where: { applicationId, txRef, gateway: 'FLUTTERWAVE' },
    });
    if (!payment) {
      throw new BadRequestException('Payment reference does not match this application.');
    }
    if (payment.status === 'SUCCESS') return payment;

    const transaction = await this.flutterwave.verifyTransactionByRef(txRef);
    const meta: Record<string, any> =
      transaction.meta ||
      (payment.providerDetails as Record<string, any> | null) ||
      {};
    if (
      transaction.txRef !== txRef ||
      meta.purpose !== 'FAN_TOURNAMENT_APPLICATION' ||
      String(meta.applicationId) !== applicationId ||
      String(meta.tournamentId) !== tournamentId ||
      String(meta.fanId) !== fanId
    ) {
      throw new BadRequestException(
        'The payment reference does not belong to this tournament application.',
      );
    }
    if (
      transaction.status?.toLowerCase() !== 'successful' ||
      Number(transaction.amount) < payment.amount ||
      transaction.currency?.toUpperCase() !== payment.currency
    ) {
      throw new BadRequestException(
        'Flutterwave has not confirmed the full tournament entry payment.',
      );
    }

    return this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        flwTransactionId: String(transaction.id),
        paidAmount: Number(transaction.amount),
        paidCurrency: payment.currency,
        paidAt: transaction.createdAt ? new Date(transaction.createdAt) : new Date(),
        providerDetails: transaction.raw as any,
      },
    });
  }

  async completeApplication(
    fanId: string,
    tournamentId: string,
    applicationId: string,
    dto: CompleteFanTournamentApplicationDto,
  ) {
    const application = await this.prisma.fanTournamentApplication.findFirst({
      where: { id: applicationId, tournamentId, fanId },
      include: {
        fan: true,
        tournament: true,
        payments: {
          where: { status: 'SUCCESS' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!application) {
      throw new NotFoundException('Tournament application not found.');
    }
    if (application.payments.length === 0) {
      throw new BadRequestException('Complete payment before activating a player profile.');
    }
    if (application.playerId) {
      const existingPlayer = await this.prisma.player.findUnique({
        where: { playerId: application.playerId },
      });
      if (existingPlayer) {
        const registration = await this.prisma.tournamentRegistration.findUnique({
          where: { fanApplicationId: applicationId },
        });
        return {
          ...(await this.createPlayerSession(existingPlayer)),
          application,
          registration,
        };
      }
    }

    const fan = application.fan;
    if (fan.isDeleted || fan.status !== 'ACTIVE') {
      throw new NotFoundException('Active fan account not found.');
    }
    const gamerTag = dto.gamerTag.trim();
    const [existingPlayer, existingTag] = await Promise.all([
      this.prisma.player.findFirst({
        where: { email: { equals: fan.email, mode: 'insensitive' } },
      }),
      this.findPlayerByGamerTag(gamerTag),
    ]);
    if (existingPlayer) {
      throw new ConflictException(
        'A player account already exists for this email. Sign in as a player.',
      );
    }
    if (existingTag) throw new ConflictException('This gamer tag is already in use.');

    const requestedPicture = dto.profilePicture?.trim();
    if (
      requestedPicture &&
      !/^data:image\/(?:jpeg|png|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(
        requestedPicture,
      )
    ) {
      throw new BadRequestException(
        'Profile picture must be a valid JPEG, PNG, GIF or WebP upload.',
      );
    }
    const profilePicture = requestedPicture
      ? await uploadBase64ToS3(requestedPicture, `player-${fan.fanId}`)
      : fan.profileImage &&
          !/^https?:\/\//i.test(fan.profileImage) &&
          !/^data:/i.test(fan.profileImage)
        ? fan.profileImage
        : null;

    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
      const latestApplication = await tx.fanTournamentApplication.findFirst({
        where: {
          id: applicationId,
          fanId,
          tournamentId,
        },
        include: { tournament: true, payments: { where: { status: 'SUCCESS' }, orderBy: { createdAt: 'desc' }, take: 1 } },
      });
      const latestPayment = latestApplication?.payments[0];
      if (!latestApplication || !latestPayment) {
        throw new BadRequestException('Application payment is not confirmed.');
      }

      const player = await this.playerService.createPlayerFromFan(tx, fan, {
        gamerTag,
        profilePicture,
        preferredPlatform: dto.preferredPlatform?.trim() || null,
      });

      const occupiedCount = await tx.tournamentRegistration.count({
        where: {
          tournamentId,
          status: {
            in: [
              TournamentRegistrationStatus.CONFIRMED,
              TournamentRegistrationStatus.REGISTERED,
              TournamentRegistrationStatus.SELECTED_UNPAID,
            ],
          },
        },
      });
      const registrationStatus =
        occupiedCount >= latestApplication.tournament.capacity
          ? TournamentRegistrationStatus.WAITLISTED
          : TournamentRegistrationStatus.CONFIRMED;
      const qrCodeString = `PLAYER:${tournamentId}:${player.playerId}`;

      const registration = await tx.tournamentRegistration.create({
        data: {
          tournamentId,
          playerId: player.playerId,
          fanApplicationId: applicationId,
          homeVenueId: latestApplication.homeVenueId,
          primaryTeamId: latestApplication.primaryTeamId,
          secondaryTeamId: latestApplication.secondaryTeamId,
          jerseySize: latestApplication.jerseySize,
          playerPhotoUrl: profilePicture,
          qrCodeString,
          status: registrationStatus,
          paymentStatus: 'PAID',
        },
      });

      const completedApplication = await tx.fanTournamentApplication.update({
        where: { id: applicationId },
        data: {
          status: FanTournamentApplicationStatus.COMPLETED,
          playerId: player.playerId,
        },
      });

      return { player, registration, application: completedApplication };
      });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'The Gamer Tag or player account is already in use.',
        );
      }
      throw error;
    }

    return {
      ...(await this.createPlayerSession(result.player)),
      registration: {
        ...result.registration,
        id: result.registration.registrationId,
      },
      application: result.application,
    };
  }
}
