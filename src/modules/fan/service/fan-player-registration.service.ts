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
  TicketStatus,
  TicketType,
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
  ) {
    const [fan, tournament] = await Promise.all([
      this.prisma.fan.findUnique({ where: { fanId } }),
      this.prisma.tournament.findUnique({ where: { tournamentId } }),
    ]);
    if (!fan || fan.isDeleted || fan.status !== 'ACTIVE') {
      throw new NotFoundException('Active fan account not found.');
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
          secondaryTeamId: footballGame ? dto.secondaryTeamId!.trim() : null,
          jerseySize: dto.jerseySize?.trim() || null,
        },
      });
    } else if (application) {
      application = await this.prisma.fanTournamentApplication.update({
        where: { id: application.id },
        data: {
          homeVenueId: dto.homeVenueId || null,
          primaryTeamId: footballGame ? dto.primaryTeamId!.trim() : null,
          secondaryTeamId: footballGame ? dto.secondaryTeamId!.trim() : null,
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
          secondaryTeamId: footballGame ? dto.secondaryTeamId!.trim() : null,
          jerseySize: dto.jerseySize?.trim() || null,
        },
      });
    }

    if (tournament.entryFee <= 0) {
      await this.prisma.payment.create({
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
      return { application, checkout: null, requiresPayment: false };
    }

    const txRef = `TAPE-APP-${application.id}-${randomUUID().slice(0, 8)}`;
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
        redirectUrl:
          this.configService.get<string>('FRONTEND_URL') ||
          this.configService.get<string>('app.frontendDomain'),
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
          providerDetails: { ...payment.providerDetails as object, checkoutUrl: checkout.link },
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
    const meta = transaction.meta || payment.providerDetails || {};
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
    const payment = application.payments[0];
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
      this.prisma.player.findFirst({
        where: { gamerTag: { equals: gamerTag, mode: 'insensitive' } },
      }),
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
      !requestedPicture.startsWith('data:image/') &&
      !/^https:\/\//i.test(requestedPicture)
    ) {
      throw new BadRequestException('Profile picture must be an image or HTTPS URL.');
    }
    const profilePicture = requestedPicture
      ? requestedPicture.startsWith('data:image/')
        ? await uploadBase64ToS3(requestedPicture, `player-${fan.fanId}`)
        : requestedPicture
      : fan.profileImage;

    const result = await this.prisma.$transaction(async (tx) => {
      const latestApplication = await tx.fanTournamentApplication.findFirst({
        where: {
          id: applicationId,
          fanId,
          tournamentId,
          paymentStatus: 'PAID',
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
        favoriteTeam: dto.favoriteTeam?.trim() || null,
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

      await tx.ticket.upsert({
        where: { qrToken: qrCodeString },
        update: {
          status: TicketStatus.ACTIVE,
          checkedIn: false,
          playerId: player.playerId,
          purchasedBy: player.playerId,
          paymentReference: latestPayment.txRef,
          flwTransactionId: latestPayment.flwTransactionId,
          paymentStatus: 'SUCCESS',
        },
        create: {
          tournamentId,
          playerId: player.playerId,
          purchasedBy: player.playerId,
          purchaserRole: 'PLAYER',
          type: TicketType.DAY_PASS,
          pricePaid: latestPayment.paidAmount ?? latestPayment.amount,
          currency: latestPayment.paidCurrency || latestPayment.currency,
          status: TicketStatus.ACTIVE,
          qrToken: qrCodeString,
          checkedIn: false,
          showTicketId: `PASS-${registration.registrationId.slice(0, 8).toUpperCase()}`,
          paymentReference: latestPayment.txRef,
          flwTransactionId: latestPayment.flwTransactionId,
          paymentStatus: 'SUCCESS',
          metadata: {
            applicationId,
            registrationId: registration.registrationId,
            entryFee: latestPayment.amount,
            paidAmount: latestPayment.paidAmount,
            paidCurrency: latestPayment.paidCurrency,
          },
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
