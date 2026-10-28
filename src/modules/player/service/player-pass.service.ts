import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { getPreSignedUrl } from '../../utils/s3.util';
import { TournamentRegistrationStatus } from '@prisma/client';

export interface CompetitorPassLicense {
  tournamentId: string;
  name: string;
  gameTitle: string;
  format: string;
  status: string;
  assignedSlot?: number | null;
  registrationId: string;
  qrCodeString: string;
  canvasImage?: string | null;
  tournamentLogoUrl?: string | null;
  organizerLogo?: string | null;
  secondaryOrganizerLogo?: string | null;
  sponsors: any[];
  registration: any;
  tournament: any;
  player: any;
}

@Injectable()
export class PlayerPassService {
  private readonly logger = new Logger(PlayerPassService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to resolve S3 pre-signed URL with resilient error boundary.
   */
  private async safePresign(urlOrKey?: string | null): Promise<string | null> {
    if (!urlOrKey) return null;
    try {
      if (!urlOrKey.startsWith('http://') && !urlOrKey.startsWith('https://')) {
        return await getPreSignedUrl(urlOrKey);
      }
      return urlOrKey;
    } catch {
      return urlOrKey;
    }
  }

  /**
   * Format Tournament Format enum to human-readable string matching UI
   */
  private formatTournamentFormat(rawFormat: string): string {
    const formatMap: Record<string, string> = {
      SINGLE_ELIMINATION: 'Single Elimination',
      DOUBLE_ELIMINATION: 'Double Elimination',
      LEAGUE: 'League',
      LEAGUE_DOUBLE: 'League (Double)',
      LEAGUE_AND_KNOCKOUT: 'League & Knockout',
      LEAGUE_AND_KNOCKOUT_DOUBLE: 'League & Knockout (Double)',
    };
    return formatMap[rawFormat] || rawFormat || 'Standard';
  }

  /**
   * 1. Retrieve all Active Tournament Passes & Competitor Licenses for logged-in Player
   * (Tab 1: 🎟️ Secure Pass & ID parity).
   */
  async getMyPasses(
    playerId: string,
    query?: { page?: number | string; limit?: number | string },
  ) {
    if (!playerId) {
      throw new NotFoundException('Player ID is required');
    }

    const registrations = await this.prisma.tournamentRegistration.findMany({
      where: {
        playerId,
      },
      include: {
        tournament: {
          include: {
            sponsors: true,
          },
        },
        player: {
          select: {
            playerId: true,
            firstName: true,
            lastName: true,
            gamerTag: true,
            profilePicture: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const activePasses: CompetitorPassLicense[] = [];

    for (const reg of registrations) {
      const tourney = reg.tournament;
      if (!tourney || tourney.isDeleted) continue;

      // Ensure high-security QR Code token parity: PLAYER:tournamentId:playerId:registrationId
      let qrToken = reg.qrCodeString;
      if (!qrToken) {
        qrToken = `PLAYER:${tourney.tournamentId}:${playerId}:${reg.registrationId}`;
        // Asynchronously persist the generated QR token in background
        void this.prisma.tournamentRegistration.update({
          where: { registrationId: reg.registrationId },
          data: { qrCodeString: qrToken },
        }).catch((err) => {
          this.logger.warn(`Failed to backfill qrCodeString for registration ${reg.registrationId}: ${err?.message}`);
        });
      }

      // Concurrently resolve presigned media assets
      const [
        playerAvatar,
        tournamentCanvas,
        organizerLogo,
        secondaryOrganizerLogo,
        tournamentLogo,
      ] = await Promise.all([
        this.safePresign(reg.playerPhotoUrl || reg.player.profilePicture),
        this.safePresign(tourney.canvasImage),
        this.safePresign(tourney.playerOrgUrl),
        this.safePresign(tourney.prOrgUrl),
        this.safePresign(tourney.tournamentLogoUrl),
      ]);

      const fullName = `${reg.player.firstName || ''} ${reg.player.lastName || ''}`.trim();
      const gamertag = reg.player.gamerTag || 'COMPETITOR';
      const humanFormat = this.formatTournamentFormat(tourney.tournamentFormat);

      const passPayload: CompetitorPassLicense = {
        tournamentId: tourney.tournamentId,
        name: tourney.name,
        gameTitle: tourney.gameTitle,
        format: humanFormat,
        status: reg.status,
        assignedSlot: reg.assignedSlot,
        registrationId: reg.registrationId,
        qrCodeString: qrToken,
        canvasImage: tournamentCanvas,
        tournamentLogoUrl: tournamentLogo,
        organizerLogo,
        secondaryOrganizerLogo,
        sponsors: (tourney.sponsors || []).map((s) => ({
          id: s.sponsorId,
          name: s.name,
          logoUrl: s.logo,
          website: s.website,
        })),
        registration: {
          id: reg.registrationId,
          registrationId: reg.registrationId,
          playerId: reg.playerId,
          tournamentId: reg.tournamentId,
          status: reg.status,
          assignedSlot: reg.assignedSlot,
          jerseySize: reg.jerseySize,
          playerPhotoUrl: playerAvatar,
          qrCodeString: qrToken,
          homeVenueId: reg.homeVenueId,
          primaryTeamId: reg.primaryTeamId,
          secondaryTeamId: reg.secondaryTeamId,
          teamSelection: {
            primaryTeamId: reg.primaryTeamId,
            secondaryTeamId: reg.secondaryTeamId,
          },
          createdAt: reg.createdAt,
        },
        tournament: {
          id: tourney.tournamentId,
          tournamentId: tourney.tournamentId,
          name: tourney.name,
          gameTitle: tourney.gameTitle,
          format: humanFormat,
          tournamentFormat: tourney.tournamentFormat,
          canvasImage: tournamentCanvas,
          tournamentLogoUrl: tournamentLogo,
          organizerLogo,
          secondaryOrganizerLogo,
          currency: tourney.currency,
          sponsors: tourney.sponsors,
        },
        player: {
          id: reg.player.playerId,
          playerId: reg.player.playerId,
          gamertag,
          fullName,
          profilePicture: playerAvatar,
        },
      };

      activePasses.push(passPayload);
    }

    const totalPasses = activePasses.length;
    const confirmedCount = activePasses.filter(
      (p) => p.status === TournamentRegistrationStatus.CONFIRMED,
    ).length;
    const registeredCount = activePasses.filter(
      (p) => p.status === TournamentRegistrationStatus.REGISTERED,
    ).length;

    let paginatedPasses = activePasses;
    let pagination: any = undefined;

    if (query?.page !== undefined || query?.limit !== undefined) {
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.max(1, Number(query.limit) || 10);
      const skip = (page - 1) * limit;
      paginatedPasses = activePasses.slice(skip, skip + limit);
      pagination = {
        total: totalPasses,
        page,
        limit,
        totalPages: Math.ceil(totalPasses / limit),
      };
    }

    return {
      totalPasses,
      confirmedCount,
      registeredCount,
      passes: paginatedPasses,
      pagination,
      meta: pagination,
    };
  }

  /**
   * 2. Retrieve a Single Tournament Pass License & Competitor Card Details
   * (Competitor Secure Card / Modal Card parity).
   */
  async getPassByTournament(playerId: string, tournamentId: string) {
    if (!playerId || !tournamentId) {
      throw new NotFoundException('Both Player ID and Tournament ID are required');
    }

    const reg = await this.prisma.tournamentRegistration.findFirst({
      where: {
        playerId,
        tournamentId,
      },
      include: {
        tournament: {
          include: {
            sponsors: true,
          },
        },
        player: {
          select: {
            playerId: true,
            firstName: true,
            lastName: true,
            gamerTag: true,
            profilePicture: true,
          },
        },
      },
    });

    if (!reg || !reg.tournament || reg.tournament.isDeleted) {
      throw new NotFoundException(
        `No competition pass credentials found for Tournament #${tournamentId}`,
      );
    }

    let qrToken = reg.qrCodeString;
    if (!qrToken) {
      qrToken = `PLAYER:${tournamentId}:${playerId}:${reg.registrationId}`;
      void this.prisma.tournamentRegistration.update({
        where: { registrationId: reg.registrationId },
        data: { qrCodeString: qrToken },
      }).catch(() => null);
    }

    const [
      playerAvatar,
      tournamentCanvas,
      organizerLogo,
      secondaryOrganizerLogo,
      tournamentLogo,
    ] = await Promise.all([
      this.safePresign(reg.playerPhotoUrl || reg.player.profilePicture),
      this.safePresign(reg.tournament.canvasImage),
      this.safePresign(reg.tournament.playerOrgUrl),
      this.safePresign(reg.tournament.prOrgUrl),
      this.safePresign(reg.tournament.tournamentLogoUrl),
    ]);

    const fullName = `${reg.player.firstName || ''} ${reg.player.lastName || ''}`.trim();
    const gamertag = reg.player.gamerTag || 'COMPETITOR';
    const humanFormat = this.formatTournamentFormat(reg.tournament.tournamentFormat);

    return {
      tournamentId,
      name: reg.tournament.name,
      gameTitle: reg.tournament.gameTitle,
      format: humanFormat,
      status: reg.status,
      assignedSlot: reg.assignedSlot,
      registrationId: reg.registrationId,
      qrCodeString: qrToken,
      canvasImage: tournamentCanvas,
      tournamentLogoUrl: tournamentLogo,
      organizerLogo,
      secondaryOrganizerLogo,
      sponsors: reg.tournament.sponsors,
      registration: {
        id: reg.registrationId,
        registrationId: reg.registrationId,
        playerId: reg.playerId,
        tournamentId: reg.tournamentId,
        status: reg.status,
        assignedSlot: reg.assignedSlot,
        jerseySize: reg.jerseySize,
        playerPhotoUrl: playerAvatar,
        qrCodeString: qrToken,
        homeVenueId: reg.homeVenueId,
        primaryTeamId: reg.primaryTeamId,
        secondaryTeamId: reg.secondaryTeamId,
        teamSelection: {
          primaryTeamId: reg.primaryTeamId,
          secondaryTeamId: reg.secondaryTeamId,
        },
      },
      tournament: {
        id: reg.tournament.tournamentId,
        tournamentId: reg.tournament.tournamentId,
        name: reg.tournament.name,
        gameTitle: reg.tournament.gameTitle,
        format: humanFormat,
        tournamentFormat: reg.tournament.tournamentFormat,
        canvasImage: tournamentCanvas,
        tournamentLogoUrl: tournamentLogo,
        organizerLogo,
        secondaryOrganizerLogo,
        sponsors: reg.tournament.sponsors,
      },
      player: {
        id: reg.player.playerId,
        playerId: reg.player.playerId,
        gamertag,
        fullName,
        profilePicture: playerAvatar,
      },
    };
  }
}
