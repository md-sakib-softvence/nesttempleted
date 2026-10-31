import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  UpdateDetailsTabDto,
  UpdateRegistrationsTabDto,
  UpdateScheduleTabDto,
  UpdateLeaderboardsTabDto,
  UpdateRafflesTabDto,
  UpdatePlayerCardTemplateTabDto,
  UpdateFanPassTemplateTabDto,
  UpdateRulesTabDto,
  UpdateTermsTabDto,
  UpdateSettingsTabDto,
} from '../dto/tournament-tabs/tournament-tabs.dto';
import {
  TournamentRegistrationStatus,
  TournamentStatus,
  SponsorStatus,
  Prisma,
} from '@prisma/client';
import { presignTournamentMedia } from '../utils/tournament-media.util';
import { TournamentLeaderboardService } from './tournament-leaderboard.service';
import { TournamentRegistrationService } from './tournament-registration.service';
import { TournamentScheduleService } from './tournament-schedule.service';

@Injectable()
export class TournamentTabsService {
  private readonly logger = new Logger(TournamentTabsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboardService: TournamentLeaderboardService,
    private readonly registrationService: TournamentRegistrationService,
    private readonly scheduleService: TournamentScheduleService,
  ) {}

  private async findTournamentOrThrow(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }
    return tournament;
  }

  // ==========================================
  // TAB 1: DETAILS
  // ==========================================

  async getDetailsTab(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      include: {
        venues: {
          include: { screens: true },
        },
        seriesTournaments: {
          include: { series: true },
        },
        manageEventPrizes: true,
      },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const schedule = (tournament.schedule as any) || {};
    const matches: any[] =
      schedule.structure?.matches || schedule.matches || [];
    const possibleMatchCount = matches.length;
    const playedCount = matches.filter(
      (m: any) => m.status === 'COMPLETED' || m.status === 'NO_SHOW',
    ).length;
    const remainingCount = Math.max(0, possibleMatchCount - playedCount);

    const linkedGroup = tournament.seriesTournaments?.[0]?.series
      ? {
          id: tournament.seriesTournaments[0].series.id,
          name: tournament.seriesTournaments[0].series.name,
          code: tournament.seriesTournaments[0].series.code,
        }
      : null;

    // Build venue utilization / heatmap data
    const uniqueMatchdaysSet = new Set<string>();
    const heatmapVenues: any[] = [];

    if (Array.isArray(schedule.calendar)) {
      schedule.calendar.forEach((calDay: any) => {
        if (calDay.date) uniqueMatchdaysSet.add(calDay.date);
      });
    }

    tournament.venues.forEach((v) => {
      const screensData = v.screens.map((screen) => {
        const slots: Array<{
          time: string;
          isOccupied: boolean;
          matchId?: string;
        }> = [];
        return {
          id: screen.screenId,
          name: screen.screenName,
          slots,
        };
      });
      heatmapVenues.push({
        venueId: v.venueId,
        venueName: v.name,
        screens: screensData,
      });
    });

    const uniqueMatchdays = Array.from(uniqueMatchdaysSet);

    return {
      tournamentId: tournament.tournamentId,
      basicInformation: {
        name: tournament.name,
        gameTitle: tournament.gameTitle,
        format: tournament.tournamentFormat,
        status: tournament.status,
        capacity: tournament.capacity,
        numberOfTeams: tournament.numberOfTeams,
        registrationMode: tournament.registrationCutOffMode,
        linkedGroup,
        possibleMatchCount,
        playedCount,
        remainingCount,
      },
      financialSettings: {
        entryFee: tournament.entryFee,
        currency: tournament.currency,
        prizePoolRule: tournament.prizeRule,
        percentage: tournament.percentage,
        houseRake: tournament.houseRake ?? 0,
        paymentWindow: tournament.paymentWindow,
      },
      venueUtilization: {
        venues: tournament.venues.map((v) => ({
          id: v.venueId,
          name: v.name,
          screens: v.screens.map((s) => ({
            id: s.screenId,
            name: s.screenName,
          })),
        })),
        uniqueMatchdays,
        heatmapData: heatmapVenues,
      },
    };
  }

  async patchDetailsTab(tournamentId: string, dto: UpdateDetailsTabDto) {
    await this.findTournamentOrThrow(tournamentId);

    const data: Prisma.TournamentUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.gameTitle !== undefined) data.gameTitle = dto.gameTitle;
    if (dto.tournamentFormat !== undefined)
      data.tournamentFormat = dto.tournamentFormat;
    if (dto.capacity !== undefined) data.capacity = dto.capacity;
    if (dto.numberOfTeams !== undefined)
      data.numberOfTeams = dto.numberOfTeams;
    if (dto.registrationCutOffMode !== undefined)
      data.registrationCutOffMode = dto.registrationCutOffMode;
    if (dto.entryFee !== undefined) data.entryFee = dto.entryFee;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.prizeRule !== undefined) data.prizeRule = dto.prizeRule;
    if (dto.percentage !== undefined) data.percentage = dto.percentage;
    if (dto.houseRake !== undefined) data.houseRake = dto.houseRake;
    if (dto.paymentWindow !== undefined)
      data.paymentWindow = dto.paymentWindow;
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.deadline !== undefined) data.deadline = new Date(dto.deadline);

    data.version = { increment: 1 };

    await this.prisma.tournament.update({
      where: { tournamentId },
      data,
    });

    return this.getDetailsTab(tournamentId);
  }

  // ==========================================
  // TAB 2: REGISTRATIONS
  // ==========================================

  async getRegistrationsTab(tournamentId: string) {
    const tournament = await this.findTournamentOrThrow(tournamentId);

    const registrations = await this.prisma.tournamentRegistration.findMany({
      where: { tournamentId },
      include: {
        player: {
          select: {
            playerId: true,
            firstName: true,
            lastName: true,
            gamerTag: true,
            email: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const registered = registrations.filter(
      (r) => r.status === TournamentRegistrationStatus.REGISTERED,
    );
    const selectedUnpaid = registrations.filter(
      (r) => r.status === TournamentRegistrationStatus.SELECTED_UNPAID,
    );
    const confirmed = registrations.filter(
      (r) => r.status === TournamentRegistrationStatus.CONFIRMED,
    );
    const waitlist = registrations.filter(
      (r) => r.status === TournamentRegistrationStatus.WAITLISTED,
    );

    return {
      tournamentId: tournament.tournamentId,
      config: {
        registrationOpen: tournament.registrationOpen,
        registrationCutOffMode: tournament.registrationCutOffMode,
        capacity: tournament.capacity,
        requireJerseySize: tournament.requireJerseySize,
        status: tournament.status,
      },
      counts: {
        registered: registered.length,
        selectedUnpaid: selectedUnpaid.length,
        confirmed: confirmed.length,
        waitlist: waitlist.length,
        total: registrations.length,
      },
      lists: {
        registered,
        selected: selectedUnpaid,
        confirmed,
        waitlist,
      },
    };
  }

  async patchRegistrationsTab(
    tournamentId: string,
    dto: UpdateRegistrationsTabDto,
  ) {
    await this.findTournamentOrThrow(tournamentId);

    if (dto.action === 'open') {
      const mode =
        dto.registrationCutOffMode ||
        (await this.prisma.tournament
          .findUnique({
            where: { tournamentId },
            select: { registrationCutOffMode: true },
          })
          .then((t) => t?.registrationCutOffMode)) ||
        'CAPACITY';
      await this.registrationService.openRegistration(tournamentId, {
        mode: mode as any,
        capacity: dto.capacity,
      });
    } else if (dto.action === 'close') {
      await this.registrationService.closeRegistration(tournamentId);
    } else if (dto.action === 'select') {
      const mode = (dto.selectionMode as any) || 'manual';
      await this.registrationService.selectRegistrations(tournamentId, {
        mode,
        registrationIds: dto.selectedPlayerIds,
      });
    } else {
      const data: Prisma.TournamentUpdateInput = {};
      if (dto.registrationOpen !== undefined)
        data.registrationOpen = dto.registrationOpen;
      if (dto.registrationCutOffMode !== undefined)
        data.registrationCutOffMode = dto.registrationCutOffMode;
      if (dto.capacity !== undefined) data.capacity = dto.capacity;
      if (dto.requireJerseySize !== undefined)
        data.requireJerseySize = dto.requireJerseySize;

      data.version = { increment: 1 };

      await this.prisma.tournament.update({
        where: { tournamentId },
        data,
      });
    }

    return this.getRegistrationsTab(tournamentId);
  }

  // ==========================================
  // TAB 3: SCHEDULE & RESULTS
  // ==========================================

  async getScheduleTab(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      include: {
        venues: {
          include: { screens: true },
        },
      },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const schedule = (tournament.schedule as any) || {};
    const matches: any[] =
      schedule.structure?.matches || schedule.matches || [];

    return {
      tournamentId: tournament.tournamentId,
      schedulingMode: tournament.schedulingMode,
      schedulingPaused: tournament.schedulingPaused,
      scheduleSettings: {
        startDate: tournament.startDate,
        deadline: tournament.deadline,
        dailyStart: tournament.dailyStart,
        dailyEnd: tournament.dailyEnd,
        matchDuration: tournament.matchDuration,
        turnoverDuration: tournament.turnoverDuration,
        buffer: tournament.buffer,
        lunchBreakTime: tournament.lunchBreakTime,
        lunchDuration: tournament.lunchDuration,
        frequencyStatus: tournament.frequencyStatus,
        frequencyArray: tournament.frequencyArray,
      },
      canonicalMatches: matches,
      groups: schedule.groups || schedule.structure?.groups || [],
      calendar: schedule.calendar || null,
      venues: tournament.venues,
    };
  }

  async patchScheduleTab(tournamentId: string, dto: UpdateScheduleTabDto) {
    await this.findTournamentOrThrow(tournamentId);

    const data: Prisma.TournamentUpdateInput = {};
    if (dto.schedulingMode !== undefined)
      data.schedulingMode = dto.schedulingMode;
    if (dto.schedulingPaused !== undefined)
      data.schedulingPaused = dto.schedulingPaused;
    if (dto.dailyStart !== undefined) data.dailyStart = dto.dailyStart;
    if (dto.dailyEnd !== undefined) data.dailyEnd = dto.dailyEnd;
    if (dto.matchDuration !== undefined)
      data.matchDuration = dto.matchDuration;
    if (dto.turnoverDuration !== undefined)
      data.turnoverDuration = dto.turnoverDuration;
    if (dto.buffer !== undefined) data.buffer = dto.buffer;
    if (dto.lunchBreakTime !== undefined)
      data.lunchBreakTime = dto.lunchBreakTime;
    if (dto.lunchDuration !== undefined)
      data.lunchDuration = dto.lunchDuration;
    if (dto.frequencyStatus !== undefined)
      data.frequencyStatus = dto.frequencyStatus;
    if (dto.frequencyArray !== undefined)
      data.frequencyArray = dto.frequencyArray;

    if (dto.action === 'pause') {
      data.schedulingPaused = true;
    } else if (dto.action === 'resume') {
      data.schedulingPaused = false;
    }

    data.version = { increment: 1 };

    await this.prisma.tournament.update({
      where: { tournamentId },
      data,
    });

    return this.getScheduleTab(tournamentId);
  }

  // ==========================================
  // TAB 4: LEADERBOARDS
  // ==========================================

  async getLeaderboardsTab(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      include: {
        seriesTournaments: {
          include: { series: true },
        },
      },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const leaderboard = await this.leaderboardService.getTournamentLeaderboard(
      tournamentId,
      'table',
    );

    const tournamentGroup = tournament.seriesTournaments?.[0]?.series
      ? {
          id: tournament.seriesTournaments[0].series.id,
          name: tournament.seriesTournaments[0].series.name,
          code: tournament.seriesTournaments[0].series.code,
        }
      : null;

    return {
      tournamentId: tournament.tournamentId,
      tournamentName: tournament.name,
      tournamentFormat: tournament.tournamentFormat,
      tournamentLeaderboard:
        (leaderboard as any).data ||
        (leaderboard as any).standings ||
        leaderboard,
      tournamentGroup,
      seriesLeaderboard: [],
    };
  }

  async patchLeaderboardsTab(
    tournamentId: string,
    dto: UpdateLeaderboardsTabDto,
  ) {
    await this.findTournamentOrThrow(tournamentId);
    // Can support manual point overrides or recalculation triggers
    return this.getLeaderboardsTab(tournamentId);
  }

  // ==========================================
  // TAB 5: RAFFLES
  // ==========================================

  async getRafflesTab(tournamentId: string) {
    await this.findTournamentOrThrow(tournamentId);

    const raffles = await this.prisma.raffle.findMany({
      where: { tournamentId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      tournamentId,
      raffles,
    };
  }

  async patchRafflesTab(tournamentId: string, dto: UpdateRafflesTabDto) {
    await this.findTournamentOrThrow(tournamentId);

    if (dto.raffleId) {
      const data: Prisma.RaffleUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.prizeDescription !== undefined)
        data.prizeDescription = dto.prizeDescription;
      if (dto.numberOfWinners !== undefined)
        data.numberOfWinners = dto.numberOfWinners;
      if (dto.status !== undefined) data.status = dto.status;
      if (dto.drawDate !== undefined) data.drawDate = new Date(dto.drawDate);
      if (dto.registrationCloseDate !== undefined)
        data.registrationCloseDate = new Date(dto.registrationCloseDate);

      await this.prisma.raffle.update({
        where: { raffleId: dto.raffleId },
        data,
      });
    } else if (dto.name && dto.prizeDescription) {
      await this.prisma.raffle.create({
        data: {
          tournamentId,
          name: dto.name,
          prizeDescription: dto.prizeDescription,
          numberOfWinners: dto.numberOfWinners || 1,
          status: dto.status || 'OPEN',
          drawDate: dto.drawDate ? new Date(dto.drawDate) : null,
          registrationCloseDate: dto.registrationCloseDate
            ? new Date(dto.registrationCloseDate)
            : null,
        },
      });
    }

    return this.getRafflesTab(tournamentId);
  }

  // ==========================================
  // TAB 6: PLAYER CARD TEMPLATE
  // ==========================================

  async getPlayerCardTemplateTab(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      include: {
        sponsors: {
          where: {
            status: { in: [SponsorStatus.PLAYER, SponsorStatus.BOTH] },
          },
        },
      },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const presigned = await presignTournamentMedia(tournament as any);

    return {
      tournamentId: tournament.tournamentId,
      organizerLogo: presigned.playerOrgUrl || tournament.playerOrgUrl,
      secondaryOrganizerLogo: presigned.prOrgUrl || tournament.prOrgUrl,
      tournamentLogo:
        presigned.tournamentLogoUrl || tournament.tournamentLogoUrl,
      canvasImage: presigned.canvasImage || tournament.canvasImage,
      sponsors: tournament.sponsors,
      playerCardTemplate: tournament.playerCardTemplate,
    };
  }

  async patchPlayerCardTemplateTab(
    tournamentId: string,
    dto: UpdatePlayerCardTemplateTabDto,
  ) {
    await this.findTournamentOrThrow(tournamentId);

    const data: Prisma.TournamentUpdateInput = {};
    if (dto.organizerLogo !== undefined || dto.playerOrgUrl !== undefined) {
      data.playerOrgUrl = dto.organizerLogo || dto.playerOrgUrl;
    }
    if (
      dto.secondaryOrganizerLogo !== undefined ||
      dto.prOrgUrl !== undefined
    ) {
      data.prOrgUrl = dto.secondaryOrganizerLogo || dto.prOrgUrl;
    }
    if (
      dto.tournamentLogo !== undefined ||
      dto.tournamentLogoUrl !== undefined
    ) {
      data.tournamentLogoUrl = dto.tournamentLogo || dto.tournamentLogoUrl;
    }
    if (dto.canvasImage !== undefined) {
      data.canvasImage = dto.canvasImage;
    }
    if (dto.playerCardTemplate !== undefined) {
      data.playerCardTemplate = dto.playerCardTemplate;
    }

    data.version = { increment: 1 };

    await this.prisma.tournament.update({
      where: { tournamentId },
      data,
    });

    // Handle sponsors if provided
    if (Array.isArray(dto.sponsors)) {
      for (const item of dto.sponsors) {
        if (typeof item === 'object' && item !== null && item.name) {
          if (item.sponsorId) {
            await this.prisma.sponsor.update({
              where: { sponsorId: item.sponsorId },
              data: {
                name: item.name,
                logo: item.logo,
                website: item.website,
                priority: item.priority,
                contact: item.contact,
                value:
                  item.value !== undefined ? Number(item.value) : undefined,
                status: SponsorStatus.PLAYER,
              },
            });
          } else {
            await this.prisma.sponsor.create({
              data: {
                tournamentId,
                name: item.name,
                logo: item.logo,
                website: item.website,
                priority: item.priority,
                contact: item.contact,
                value:
                  item.value !== undefined ? Number(item.value) : undefined,
                status: SponsorStatus.PLAYER,
              },
            });
          }
        }
      }
    }

    return this.getPlayerCardTemplateTab(tournamentId);
  }

  // ==========================================
  // TAB 7: FAN PASS TEMPLATE
  // ==========================================

  async getFanPassTemplateTab(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      include: {
        sponsors: {
          where: {
            status: { in: [SponsorStatus.FAN, SponsorStatus.BOTH] },
          },
        },
      },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const presigned = await presignTournamentMedia(tournament as any);

    return {
      tournamentId: tournament.tournamentId,
      organizerLogo: presigned.playerOrgUrl || tournament.playerOrgUrl,
      secondaryOrganizerLogo: presigned.prOrgUrl || tournament.prOrgUrl,
      tournamentLogo:
        presigned.tournamentLogoUrl || tournament.tournamentLogoUrl,
      fanPassArtUrl: presigned.canvasImage || tournament.canvasImage,
      sponsors: tournament.sponsors,
      fanPassTemplate: tournament.fanPassTemplate,
    };
  }

  async patchFanPassTemplateTab(
    tournamentId: string,
    dto: UpdateFanPassTemplateTabDto,
  ) {
    await this.findTournamentOrThrow(tournamentId);

    const data: Prisma.TournamentUpdateInput = {};
    if (dto.organizerLogo !== undefined || dto.playerOrgUrl !== undefined) {
      data.playerOrgUrl = dto.organizerLogo || dto.playerOrgUrl;
    }
    if (
      dto.secondaryOrganizerLogo !== undefined ||
      dto.prOrgUrl !== undefined
    ) {
      data.prOrgUrl = dto.secondaryOrganizerLogo || dto.prOrgUrl;
    }
    if (
      dto.tournamentLogo !== undefined ||
      dto.tournamentLogoUrl !== undefined
    ) {
      data.tournamentLogoUrl = dto.tournamentLogo || dto.tournamentLogoUrl;
    }
    if (dto.fanPassArtUrl !== undefined || dto.canvasImage !== undefined) {
      data.canvasImage = dto.fanPassArtUrl || dto.canvasImage;
    }
    if (dto.fanPassTemplate !== undefined) {
      data.fanPassTemplate = dto.fanPassTemplate;
    }

    data.version = { increment: 1 };

    await this.prisma.tournament.update({
      where: { tournamentId },
      data,
    });

    if (Array.isArray(dto.sponsors)) {
      for (const item of dto.sponsors) {
        if (typeof item === 'object' && item !== null && item.name) {
          if (item.sponsorId) {
            await this.prisma.sponsor.update({
              where: { sponsorId: item.sponsorId },
              data: {
                name: item.name,
                logo: item.logo,
                website: item.website,
                priority: item.priority,
                contact: item.contact,
                value:
                  item.value !== undefined ? Number(item.value) : undefined,
                status: SponsorStatus.FAN,
              },
            });
          } else {
            await this.prisma.sponsor.create({
              data: {
                tournamentId,
                name: item.name,
                logo: item.logo,
                website: item.website,
                priority: item.priority,
                contact: item.contact,
                value:
                  item.value !== undefined ? Number(item.value) : undefined,
                status: SponsorStatus.FAN,
              },
            });
          }
        }
      }
    }

    return this.getFanPassTemplateTab(tournamentId);
  }

  // ==========================================
  // TAB 8: RULES
  // ==========================================

  async getRulesTab(tournamentId: string) {
    const tournament = await this.findTournamentOrThrow(tournamentId);
    const presigned = await presignTournamentMedia(tournament as any);

    return {
      tournamentId: tournament.tournamentId,
      rules: presigned.rules || tournament.rules || [],
      rulesUrl:
        presigned.rules?.[0] || tournament.rules?.[0] || null,
    };
  }

  async patchRulesTab(tournamentId: string, dto: UpdateRulesTabDto) {
    await this.findTournamentOrThrow(tournamentId);

    const data: Prisma.TournamentUpdateInput = {};
    if (dto.rules !== undefined) {
      data.rules = dto.rules;
    } else if (dto.rulesUrl !== undefined) {
      data.rules = [dto.rulesUrl];
    }

    data.version = { increment: 1 };

    await this.prisma.tournament.update({
      where: { tournamentId },
      data,
    });

    return this.getRulesTab(tournamentId);
  }

  // ==========================================
  // TAB 9: T&CS (TERMS & CONDITIONS)
  // ==========================================

  async getTermsTab(tournamentId: string) {
    const tournament = await this.findTournamentOrThrow(tournamentId);
    const presigned = await presignTournamentMedia(tournament as any);

    return {
      tournamentId: tournament.tournamentId,
      tsAndTc: presigned.tsAndTc || tournament.tsAndTc || [],
      termsAndConditions: presigned.tsAndTc || tournament.tsAndTc || [],
      termsAndConditionsUrl:
        presigned.tsAndTc?.[0] || tournament.tsAndTc?.[0] || null,
    };
  }

  async patchTermsTab(tournamentId: string, dto: UpdateTermsTabDto) {
    await this.findTournamentOrThrow(tournamentId);

    const terms =
      dto.tsAndTc ||
      dto.termsAndConditions ||
      (dto.termsAndConditionsUrl ? [dto.termsAndConditionsUrl] : undefined);

    const data: Prisma.TournamentUpdateInput = {};
    if (terms !== undefined) {
      data.tsAndTc = terms;
    }

    data.version = { increment: 1 };

    await this.prisma.tournament.update({
      where: { tournamentId },
      data,
    });

    return this.getTermsTab(tournamentId);
  }

  // ==========================================
  // TAB 10: SETTINGS
  // ==========================================

  async getSettingsTab(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      include: {
        venues: {
          include: { screens: true },
        },
        manageEventCosts: true,
        manageEventPrizes: true,
      },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    return {
      tournamentId: tournament.tournamentId,
      name: tournament.name,
      format: tournament.tournamentFormat,
      registrationMode: tournament.registrationCutOffMode,
      maxCapacity: tournament.capacity,
      capacity: tournament.capacity,
      deadlineDate: tournament.deadline,
      startDate: tournament.startDate,
      schedulingMode: tournament.schedulingMode,
      scheduleSettings: {
        startDate: tournament.startDate,
        dailyStart: tournament.dailyStart,
        dailyEnd: tournament.dailyEnd,
        matchDuration: tournament.matchDuration,
        turnoverDuration: tournament.turnoverDuration,
        buffer: tournament.buffer,
        lunchBreakTime: tournament.lunchBreakTime,
        lunchDuration: tournament.lunchDuration,
      },
      frequencySettings: {
        frequencyStatus: tournament.frequencyStatus,
        frequencyArray: tournament.frequencyArray,
      },
      status: tournament.status,
      venues: tournament.venues,
      eventCosts: tournament.manageEventCosts,
      prizePayouts: tournament.manageEventPrizes,
    };
  }

  async patchSettingsTab(tournamentId: string, dto: UpdateSettingsTabDto) {
    await this.findTournamentOrThrow(tournamentId);

    const data: Prisma.TournamentUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.format !== undefined) data.tournamentFormat = dto.format;
    if (dto.registrationMode !== undefined)
      data.registrationCutOffMode = dto.registrationMode;
    if (dto.maxCapacity !== undefined || dto.capacity !== undefined) {
      data.capacity = dto.maxCapacity ?? dto.capacity;
      data.numberOfTeams = dto.maxCapacity ?? dto.capacity;
    }
    if (dto.deadlineDate !== undefined)
      data.deadline = new Date(dto.deadlineDate);
    if (dto.startDate !== undefined)
      data.startDate = new Date(dto.startDate);
    if (dto.schedulingMode !== undefined)
      data.schedulingMode = dto.schedulingMode;
    if (dto.status !== undefined) data.status = dto.status;

    if (dto.scheduleSettings) {
      if (dto.scheduleSettings.dailyStart !== undefined)
        data.dailyStart = dto.scheduleSettings.dailyStart;
      if (dto.scheduleSettings.dailyEnd !== undefined)
        data.dailyEnd = dto.scheduleSettings.dailyEnd;
      if (dto.scheduleSettings.matchDuration !== undefined)
        data.matchDuration = dto.scheduleSettings.matchDuration;
      if (dto.scheduleSettings.turnoverDuration !== undefined)
        data.turnoverDuration = dto.scheduleSettings.turnoverDuration;
      if (dto.scheduleSettings.buffer !== undefined)
        data.buffer = dto.scheduleSettings.buffer;
      if (dto.scheduleSettings.lunchBreakTime !== undefined)
        data.lunchBreakTime = dto.scheduleSettings.lunchBreakTime;
      if (dto.scheduleSettings.lunchDuration !== undefined)
        data.lunchDuration = dto.scheduleSettings.lunchDuration;
      if (dto.scheduleSettings.startDate !== undefined)
        data.startDate = new Date(dto.scheduleSettings.startDate);
    }

    if (dto.frequencySettings) {
      if (dto.frequencySettings.frequencyStatus !== undefined)
        data.frequencyStatus = dto.frequencySettings.frequencyStatus;
      if (dto.frequencySettings.frequencyArray !== undefined)
        data.frequencyArray = dto.frequencySettings.frequencyArray;
    }

    data.version = { increment: 1 };

    await this.prisma.tournament.update({
      where: { tournamentId },
      data,
    });

    // Venues sync if provided
    if (Array.isArray(dto.venues)) {
      for (const v of dto.venues) {
        if (typeof v === 'object' && v !== null && v.name) {
          if (v.id || v.venueId) {
            const venueId = v.id || v.venueId;
            await this.prisma.venue.update({
              where: { venueId },
              data: { name: v.name, address: v.address || v.name },
            });
          } else {
            const created = await this.prisma.venue.create({
              data: {
                tournamentId,
                name: v.name,
                address: v.address || v.name,
              },
            });
            if (Array.isArray(v.screens)) {
              for (const s of v.screens) {
                await this.prisma.screen.create({
                  data: {
                    venueId: created.venueId,
                    screenName: s.name || s.screenName || 'Screen',
                  },
                });
              }
            }
          }
        }
      }
    }

    // Costs sync if provided
    if (Array.isArray(dto.eventCosts)) {
      for (const c of dto.eventCosts) {
        if (typeof c === 'object' && c !== null && c.category && c.amount !== undefined) {
          if (c.id || c.manageEventCostId) {
            await this.prisma.manageEventCost.update({
              where: { manageEventCostId: c.id || c.manageEventCostId },
              data: { costCategory: c.category, amount: Number(c.amount) },
            });
          } else {
            await this.prisma.manageEventCost.create({
              data: {
                tournamentId,
                costCategory: c.category,
                amount: Number(c.amount),
              },
            });
          }
        }
      }
    }

    // Prizes sync if provided
    if (Array.isArray(dto.prizePayouts)) {
      for (const p of dto.prizePayouts) {
        if (typeof p === 'object' && p !== null && p.category && p.amount !== undefined) {
          if (p.id || p.manageEventPrizeId) {
            await this.prisma.manageEventPrize.update({
              where: { manageEventPrizeId: p.id || p.manageEventPrizeId },
              data: { prizeCategory: p.category, amount: Number(p.amount) },
            });
          } else {
            await this.prisma.manageEventPrize.create({
              data: {
                tournamentId,
                prizeCategory: p.category,
                amount: Number(p.amount),
              },
            });
          }
        }
      }
    }

    return this.getSettingsTab(tournamentId);
  }

  // ==========================================
  // DYNAMIC TAB DISPATCHER
  // ==========================================

  async getTab(tournamentId: string, tabName: string) {
    const normalized = tabName.toLowerCase().replace(/[-_&]/g, '');
    switch (normalized) {
      case 'details':
        return this.getDetailsTab(tournamentId);
      case 'registrations':
      case 'registration':
        return this.getRegistrationsTab(tournamentId);
      case 'schedule':
      case 'scheduleresults':
      case 'scheduleresult':
        return this.getScheduleTab(tournamentId);
      case 'leaderboard':
      case 'leaderboards':
        return this.getLeaderboardsTab(tournamentId);
      case 'raffles':
      case 'raffle':
        return this.getRafflesTab(tournamentId);
      case 'playercardtemplate':
      case 'playercard':
        return this.getPlayerCardTemplateTab(tournamentId);
      case 'fanpasstemplate':
      case 'fanpass':
        return this.getFanPassTemplateTab(tournamentId);
      case 'rules':
      case 'rule':
        return this.getRulesTab(tournamentId);
      case 'terms':
      case 'tc':
      case 'tcs':
      case 'termsandconditions':
        return this.getTermsTab(tournamentId);
      case 'settings':
      case 'setting':
        return this.getSettingsTab(tournamentId);
      default:
        throw new BadRequestException(
          `Unknown tab '${tabName}'. Valid tabs are: details, registrations, schedule, leaderboards, raffles, playerCardTemplate, fanPassTemplate, rules, terms, settings`,
        );
    }
  }

  async patchTab(tournamentId: string, tabName: string, body: any) {
    const normalized = tabName.toLowerCase().replace(/[-_&]/g, '');
    switch (normalized) {
      case 'details':
        return this.patchDetailsTab(tournamentId, body);
      case 'registrations':
      case 'registration':
        return this.patchRegistrationsTab(tournamentId, body);
      case 'schedule':
      case 'scheduleresults':
      case 'scheduleresult':
        return this.patchScheduleTab(tournamentId, body);
      case 'leaderboard':
      case 'leaderboards':
        return this.patchLeaderboardsTab(tournamentId, body);
      case 'raffles':
      case 'raffle':
        return this.patchRafflesTab(tournamentId, body);
      case 'playercardtemplate':
      case 'playercard':
        return this.patchPlayerCardTemplateTab(tournamentId, body);
      case 'fanpasstemplate':
      case 'fanpass':
        return this.patchFanPassTemplateTab(tournamentId, body);
      case 'rules':
      case 'rule':
        return this.patchRulesTab(tournamentId, body);
      case 'terms':
      case 'tc':
      case 'tcs':
      case 'termsandconditions':
        return this.patchTermsTab(tournamentId, body);
      case 'settings':
      case 'setting':
        return this.patchSettingsTab(tournamentId, body);
      default:
        throw new BadRequestException(
          `Unknown tab '${tabName}'. Valid tabs are: details, registrations, schedule, leaderboards, raffles, playerCardTemplate, fanPassTemplate, rules, terms, settings`,
        );
    }
  }
}
