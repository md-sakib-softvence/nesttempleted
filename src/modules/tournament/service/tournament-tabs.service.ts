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
  QueryTabRegistrationsDto,
  QueryTabScheduleDto,
  QueryTabLeaderboardsDto,
  QueryTabRafflesDto,
} from '../dto/tournament-tabs/tournament-tabs.dto';
import {
  TournamentRegistrationStatus,
  TournamentStatus,
  SponsorStatus,
  Prisma,
} from '@prisma/client';
import {
  presignTournamentMedia,
  safePresignUrl,
  extractStorageKey,
} from '../utils/tournament-media.util';
import { calculatePaginationMeta } from '../../utils/query.util';
import { normalizeStringArray } from '../utils/file-upload.util';
import { mapPrizeRule } from '../dto/tournament/create-tournament.dto';
import { TournamentLeaderboardService } from './tournament-leaderboard.service';
import { TournamentRegistrationService } from './tournament-registration.service';
import { TournamentScheduleService } from './tournament-schedule.service';
import { parseRaffleRegistrationCloseDate } from '../utils/raffle-date.util';

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
  // TAB 1: DETAILS & OVERVIEW
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
        _count: {
          select: {
            registrations: {
              where: { status: TournamentRegistrationStatus.CONFIRMED },
            },
          },
        },
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

    // Financial calculations
    const confirmedCount = tournament._count?.registrations ?? 0;
    const entryFee = tournament.entryFee ?? 0;
    const totalCollected = confirmedCount * entryFee;
    const prizePoolPercent = tournament.percentage ?? 70;
    const houseRakePercent = tournament.houseRake ?? 10;
    const netEarningsPercent = Math.max(
      0,
      100 - prizePoolPercent - houseRakePercent,
    );

    let prizePoolAmount = 0;
    if (tournament.prizeRule === 'FIXED_AMOUNT') {
      prizePoolAmount =
        tournament.manageEventPrizes?.reduce(
          (sum, p) => sum + (p.amount || 0),
          0,
        ) || 0;
    } else {
      prizePoolAmount = (totalCollected * prizePoolPercent) / 100;
    }
    const platformFeeAmount = (totalCollected * houseRakePercent) / 100;

    // Build venue utilization & unique matchdays
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
    const primaryVenue = tournament.venues?.[0]
      ? `${tournament.venues[0].name}, ${tournament.venues[0].address}`
      : 'TBD';

    const presigned = await presignTournamentMedia(tournament as any);

    const bannerUrl = presigned.canvasImage || null;
    const logo = presigned.tournamentLogoUrl || presigned.canvasImage || null;
    const description =
      tournament.rules?.[0] || 'Tournament details and overview';

    return {
      tournamentId: tournament.tournamentId,
      basicInformation: {
        name: tournament.name,
        gameTitle: tournament.gameTitle,
        gameType: tournament.gameType,
        format: tournament.tournamentFormat,
        status: tournament.status,
        capacity: tournament.capacity,
        numberOfTeams: tournament.numberOfTeams,
        registrationMode: tournament.registrationCutOffMode,
        registrationOpen: tournament.registrationOpen,
        linkedGroup,
        possibleMatchCount,
        playedCount,
        remainingCount,
        bannerUrl,
        logo,
        description,
        startDate: tournament.startDate
          ? tournament.startDate.toISOString()
          : null,
        deadline: tournament.deadline
          ? tournament.deadline.toISOString()
          : null,
        venue: primaryVenue,
      },
      financialSettings: {
        entryFee: tournament.entryFee,
        currency: tournament.currency,
        prizePoolRule: tournament.prizeRule,
        percentage: tournament.percentage,
        houseRake: tournament.houseRake ?? 0,
        paymentWindow: tournament.paymentWindow,
        totalCollected,
        prizePoolAmount,
        platformFeeAmount,
        netEarningsPercent,
        prizePayouts: tournament.manageEventPrizes.map((prize) => ({
          id: prize.manageEventPrizeId,
          category: prize.prizeCategory,
          amount: prize.amount,
        })),
      },
      venueUtilization: {
        venues: tournament.venues.map((v) => ({
          id: v.venueId,
          name: v.name,
          address: v.address,
          screens: v.screens.map((s) => ({
            id: s.screenId,
            name: s.screenName,
            slots: [],
          })),
        })),
        uniqueMatchdays,
        heatmapData: heatmapVenues,
      },
      rulesUrl: presigned.rules?.[0] || null,
      termsAndConditionsUrl: presigned.tsAndTc?.[0] || null,
    };
  }

  async patchDetailsTab(tournamentId: string, dto: UpdateDetailsTabDto) {
    await this.findTournamentOrThrow(tournamentId);

    const data: Prisma.TournamentUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.gameTitle !== undefined) data.gameTitle = dto.gameTitle;
    if (dto.gameType !== undefined) data.gameType = dto.gameType;
    if (dto.tournamentFormat !== undefined)
      data.tournamentFormat = dto.tournamentFormat;
    if (dto.capacity !== undefined) data.capacity = dto.capacity;
    if (dto.numberOfTeams !== undefined) data.numberOfTeams = dto.numberOfTeams;
    if (dto.registrationCutOffMode !== undefined)
      data.registrationCutOffMode = dto.registrationCutOffMode;
    if (dto.entryFee !== undefined) data.entryFee = dto.entryFee;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.prizeRule !== undefined) data.prizeRule = dto.prizeRule;
    if (dto.percentage !== undefined) data.percentage = dto.percentage;
    if (dto.houseRake !== undefined) data.houseRake = dto.houseRake;
    if (dto.paymentWindow !== undefined) data.paymentWindow = dto.paymentWindow;
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
  // TAB 2: REGISTRATIONS MANAGEMENT
  // ==========================================

  async getRegistrationsTab(
    tournamentId: string,
    query?: QueryTabRegistrationsDto,
  ) {
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Number(query?.limit) || 20);
    const skip = (page - 1) * limit;

    // Single-batch concurrent DB roundtrip: tournament metadata + status grouping
    const [tournament, statusCounts] = await Promise.all([
      this.prisma.tournament.findUnique({
        where: { tournamentId },
        select: {
          tournamentId: true,
          registrationOpen: true,
          registrationCutOffMode: true,
          capacity: true,
          numberOfTeams: true,
          requireJerseySize: true,
          status: true,
          isDeleted: true,
          venues: { select: { venueId: true, name: true } },
        },
      }),
      this.prisma.tournamentRegistration.groupBy({
        by: ['status'],
        where: { tournamentId },
        _count: { _all: true },
      }),
    ]);

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    let regCount = 0;
    let selectedCount = 0;
    let confirmedCount = 0;
    let waitlistCount = 0;
    for (const sc of statusCounts) {
      if (sc.status === TournamentRegistrationStatus.REGISTERED) {
        regCount = sc._count._all;
      } else if (sc.status === TournamentRegistrationStatus.SELECTED_UNPAID) {
        selectedCount = sc._count._all;
      } else if (sc.status === TournamentRegistrationStatus.CONFIRMED) {
        confirmedCount = sc._count._all;
      } else if (sc.status === TournamentRegistrationStatus.WAITLISTED) {
        waitlistCount = sc._count._all;
      }
    }
    const totalCount =
      regCount + selectedCount + confirmedCount + waitlistCount;

    let statusFilter: TournamentRegistrationStatus | undefined = query?.status;
    if (query?.tab === 'registered') {
      statusFilter = TournamentRegistrationStatus.REGISTERED;
    } else if (query?.tab === 'selected') {
      statusFilter = TournamentRegistrationStatus.SELECTED_UNPAID;
    } else if (query?.tab === 'confirmed') {
      statusFilter = TournamentRegistrationStatus.CONFIRMED;
    } else if (query?.tab === 'waitlist') {
      statusFilter = TournamentRegistrationStatus.WAITLISTED;
    }

    const where: Prisma.TournamentRegistrationWhereInput = {
      tournamentId,
      ...(statusFilter && { status: statusFilter }),
      ...(query?.paymentStatus && {
        paymentStatus: { equals: query.paymentStatus, mode: 'insensitive' },
      }),
      ...(query?.search && {
        player: {
          OR: [
            { gamerTag: { contains: query.search, mode: 'insensitive' } },
            { firstName: { contains: query.search, mode: 'insensitive' } },
            { lastName: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      }),
    };

    const [tabFilteredCount, paginatedItems] = await Promise.all([
      this.prisma.tournamentRegistration.count({ where }),
      this.prisma.tournamentRegistration.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          registrationId: true,
          playerId: true,
          homeVenueId: true,
          jerseySize: true,
          status: true,
          paymentStatus: true,
          paymentDeadline: true,
          qrCodeString: true,
          checkedInVenue: true,
          createdAt: true,
          player: {
            select: {
              playerId: true,
              firstName: true,
              lastName: true,
              gamerTag: true,
              email: true,
              profilePicture: true,
            },
          },
        },
      }),
    ]);

    const venueMap = new Map<string, string>();
    (tournament.venues || []).forEach((v) => venueMap.set(v.venueId, v.name));

    const normalizedRegistrations = paginatedItems.map((r) => {
      const fullName =
        [r.player?.firstName, r.player?.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        r.player?.gamerTag ||
        'Anonymous Player';

      return {
        registrationId: r.registrationId,
        playerId: r.playerId,
        gamertag: r.player?.gamerTag || fullName,
        fullName,
        email: r.player?.email || '',
        playerPhotoUrl: r.player?.profilePicture || null,
        homeVenueId: r.homeVenueId || null,
        homeVenueName: r.homeVenueId
          ? venueMap.get(r.homeVenueId) || null
          : null,
        jerseySize: r.jerseySize || null,
        status: r.status,
        paymentStatus: r.paymentStatus,
        registeredAt: r.createdAt.toISOString(),
        registrationDate: r.createdAt.toISOString(),
        paymentDeadline: r.paymentDeadline
          ? r.paymentDeadline.toISOString()
          : null,
        qrCodeString: r.qrCodeString || `PLAYER:${tournamentId}:${r.playerId}`,
        checkedInVenue: r.checkedInVenue ?? false,
      };
    });

    const pagination = calculatePaginationMeta(tabFilteredCount, page, limit);

    return {
      tournamentId: tournament.tournamentId,
      registrationOpen: tournament.registrationOpen,
      registrationCutOffMode: tournament.registrationCutOffMode,
      capacity: tournament.capacity,
      requireJerseySize: tournament.requireJerseySize,
      counts: {
        total: totalCount,
        registered: regCount,
        selected: selectedCount,
        selectedUnpaid: selectedCount,
        confirmed: confirmedCount,
        waitlisted: waitlistCount,
        waitlist: waitlistCount,
      },
      registrations: normalizedRegistrations,
      items: normalizedRegistrations, // Backward-compatibility
      pagination,
      config: {
        registrationOpen: tournament.registrationOpen,
        registrationCutOffMode: tournament.registrationCutOffMode,
        capacity: tournament.capacity,
        requireJerseySize: tournament.requireJerseySize,
        status: tournament.status,
      },
    };
  }

  async patchRegistrationsTab(
    tournamentId: string,
    dto: UpdateRegistrationsTabDto,
  ) {
    const tournament = await this.findTournamentOrThrow(tournamentId);

    if (dto.action === 'open') {
      const mode =
        dto.registrationCutOffMode ||
        tournament.registrationCutOffMode ||
        'CAPACITY';
      await this.registrationService.openRegistration(tournamentId, {
        mode,
        capacity: dto.capacity,
      });
    } else if (dto.action === 'close') {
      await this.registrationService.closeRegistration(tournamentId);
    } else if (dto.action === 'select') {
      const mode = (dto.selectionMode as any) || 'first_in';
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

    // Automated Capacity Trigger: auto-close registration if CAPACITY mode reached
    const updated = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      select: {
        capacity: true,
        registrationCutOffMode: true,
        registrationOpen: true,
        _count: {
          select: {
            registrations: {
              where: { status: TournamentRegistrationStatus.CONFIRMED },
            },
          },
        },
      },
    });

    if (
      updated &&
      updated.registrationOpen &&
      updated.registrationCutOffMode === 'CAPACITY' &&
      updated._count.registrations >= updated.capacity
    ) {
      await this.prisma.tournament.update({
        where: { tournamentId },
        data: { registrationOpen: false },
      });
    }

    return this.getRegistrationsTab(tournamentId);
  }

  // ==========================================
  // TAB 3: SCHEDULE & RESULTS
  // ==========================================

  async getScheduleTab(tournamentId: string, query?: QueryTabScheduleDto) {
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
    const rawMatches: any[] =
      schedule.structure?.matches || schedule.matches || [];

    // Build venue and screen name lookup maps for O(1) resolution
    const venueMap = new Map<string, string>();
    const screenMap = new Map<string, string>();
    (tournament.venues || []).forEach((v) => {
      venueMap.set(v.venueId, v.name);
      (v.screens || []).forEach((s) => screenMap.set(s.screenId, s.screenName));
    });

    // Normalize matches into standard contract
    const allMatches = rawMatches.map((m: any, idx: number) => {
      const matchId = m.id || m.matchId || `match-${idx + 1}`;
      const vId = m.venueId || m.physicalAllocation?.venueId || null;
      const sId = m.screenId || m.physicalAllocation?.screenId || null;

      const p1 = m.player1 || {
        id: m.participant1Ref?.value || 'p-tbd-1',
        gamertag:
          m.participant1Ref?.displayName ||
          m.participant1Ref?.gamerTag ||
          'TBD',
        name:
          m.participant1Ref?.name || m.participant1Ref?.displayName || 'TBD',
        avatar: m.participant1Ref?.avatar || null,
      };

      const p2 = m.player2 || {
        id: m.participant2Ref?.value || 'p-tbd-2',
        gamertag:
          m.participant2Ref?.displayName ||
          m.participant2Ref?.gamerTag ||
          'TBD',
        name:
          m.participant2Ref?.name || m.participant2Ref?.displayName || 'TBD',
        avatar: m.participant2Ref?.avatar || null,
      };

      return {
        id: matchId,
        stage: m.stage || (m.bracketSection ? m.bracketSection : 'KNOCKOUT'),
        round: m.round || `Round ${m.roundNumber || 1}`,
        venueId: vId,
        venueName: vId ? venueMap.get(vId) || m.venueName || null : null,
        screenId: sId,
        screenName: sId ? screenMap.get(sId) || m.screenName || null : null,
        scheduledDate: m.scheduledDate || m.date || null,
        startTime: m.startTime || m.time || null,
        endTime: m.endTime || null,
        status: m.status || 'SCHEDULED',
        player1: p1,
        player2: p2,
        score1: m.score1 !== undefined ? m.score1 : null,
        score2: m.score2 !== undefined ? m.score2 : null,
        winnerId: m.winnerId || null,
      };
    });

    let filteredMatches = allMatches;
    if (query?.date) {
      filteredMatches = filteredMatches.filter(
        (m: any) => String(m.scheduledDate) === String(query.date),
      );
    }
    if (query?.venueId) {
      filteredMatches = filteredMatches.filter(
        (m: any) => String(m.venueId) === String(query.venueId),
      );
    }
    if (query?.round) {
      filteredMatches = filteredMatches.filter(
        (m: any) => String(m.round) === String(query.round),
      );
    }
    if (query?.status) {
      filteredMatches = filteredMatches.filter(
        (m: any) => m.status === query.status,
      );
    }
    if (query?.isAllocated !== undefined) {
      const isAlloc = query.isAllocated === 'true';
      filteredMatches = filteredMatches.filter((m: any) =>
        isAlloc ? !!(m.startTime || m.screenId) : !(m.startTime || m.screenId),
      );
    }

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Number(query?.limit) || 25);
    const total = filteredMatches.length;
    const paginatedMatches = filteredMatches.slice(
      (page - 1) * limit,
      page * limit,
    );
    const pagination = calculatePaginationMeta(total, page, limit);

    // Extract calendar unique matchdays & policies
    const uniqueMatchdaysSet = new Set<string>();
    const policies: Record<string, any> = {};

    if (Array.isArray(schedule.calendar)) {
      schedule.calendar.forEach((calVenue: any) => {
        (calVenue.screens || []).forEach((scr: any) => {
          (scr.days || []).forEach((d: any) => {
            if (d.date) {
              uniqueMatchdaysSet.add(d.date);
              if (d.schedulingPolicy && !policies[d.date]) {
                policies[d.date] = d.schedulingPolicy;
              }
            }
          });
        });
      });
    }

    allMatches.forEach((m) => {
      if (m.scheduledDate) uniqueMatchdaysSet.add(m.scheduledDate);
    });

    const uniqueMatchdays = Array.from(uniqueMatchdaysSet);

    return {
      tournamentId: tournament.tournamentId,
      schedulingMode: tournament.schedulingMode,
      schedulingPaused: tournament.schedulingPaused,
      dailyStart: tournament.dailyStart,
      dailyEnd: tournament.dailyEnd,
      matchDuration: tournament.matchDuration,
      turnoverDuration: tournament.turnoverDuration,
      buffer: tournament.buffer,
      lunchBreakTime: tournament.lunchBreakTime,
      lunchDuration: tournament.lunchDuration,
      frequencyStatus: tournament.frequencyStatus,
      frequencyArray: tournament.frequencyArray,
      matches: paginatedMatches,
      canonicalMatches: paginatedMatches, // Backward-compatibility
      totalMatches: total,
      groups: schedule.groups || schedule.structure?.groups || [],
      calendar: {
        uniqueMatchdays,
        policies,
        raw: schedule.calendar || null,
      },
      venues: tournament.venues,
      pagination,
    };
  }

  async patchScheduleTab(tournamentId: string, dto: UpdateScheduleTabDto) {
    const tournament = await this.findTournamentOrThrow(tournamentId);

    const data: Prisma.TournamentUpdateInput = {};
    if (dto.schedulingMode !== undefined)
      data.schedulingMode = dto.schedulingMode;
    if (dto.schedulingPaused !== undefined)
      data.schedulingPaused = dto.schedulingPaused;
    if (dto.dailyStart !== undefined) data.dailyStart = dto.dailyStart;
    if (dto.dailyEnd !== undefined) data.dailyEnd = dto.dailyEnd;
    if (dto.matchDuration !== undefined) data.matchDuration = dto.matchDuration;
    if (dto.turnoverDuration !== undefined)
      data.turnoverDuration = dto.turnoverDuration;
    if (dto.buffer !== undefined) data.buffer = dto.buffer;
    if (dto.lunchBreakTime !== undefined)
      data.lunchBreakTime = dto.lunchBreakTime;
    if (dto.lunchDuration !== undefined) data.lunchDuration = dto.lunchDuration;
    if (dto.frequencyStatus !== undefined)
      data.frequencyStatus = dto.frequencyStatus;
    if (dto.frequencyArray !== undefined)
      data.frequencyArray = dto.frequencyArray;

    if (dto.matchdayWindows?.length) {
      const currentSchedule = (tournament.schedule as any) || {};
      const calendar = currentSchedule.calendar;
      if (!Array.isArray(calendar)) {
        throw new BadRequestException(
          'Generate the tournament calendar before configuring matchday windows.',
        );
      }

      const requestedDates = new Set(dto.matchdayWindows.map((item) => item.date));
      const existingDates = new Set<string>();
      for (const venue of calendar) {
        for (const screen of venue.screens || []) {
          for (const day of screen.days || []) {
            if (requestedDates.has(day.date)) existingDates.add(day.date);
          }
        }
      }
      const unknownDate = dto.matchdayWindows.find(
        (item) => !existingDates.has(item.date),
      );
      if (unknownDate) {
        throw new BadRequestException(
          `Matchday ${unknownDate.date} is not part of this tournament calendar.`,
        );
      }

      const policyByDate = new Map(
        dto.matchdayWindows.map((item) => [
          item.date,
          {
            isWindowOpen: item.isWindowOpen,
            windowOpenTime: item.windowOpenTime || '',
            windowCloseTime: item.windowCloseTime || '',
          },
        ]),
      );
      data.schedule = {
        ...currentSchedule,
        calendar: calendar.map((venue: any) => ({
          ...venue,
          screens: (venue.screens || []).map((screen: any) => ({
            ...screen,
            days: (screen.days || []).map((day: any) => {
              const policy = policyByDate.get(day.date);
              return policy ? { ...day, schedulingPolicy: policy } : day;
            }),
          })),
        })),
      } as Prisma.InputJsonValue;
    }

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
  // TAB 4: LEADERBOARDS & ANALYTICS
  // ==========================================

  async getLeaderboardsTab(
    tournamentId: string,
    query?: QueryTabLeaderboardsDto,
  ) {
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

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Number(query?.limit) || 25);

    const leaderboard = await this.leaderboardService.getTournamentLeaderboard(
      tournamentId,
      query?.filter || 'table',
      { page, limit },
    );

    const tournamentGroup = tournament.seriesTournaments?.[0]?.series
      ? {
          id: tournament.seriesTournaments[0].series.id,
          name: tournament.seriesTournaments[0].series.name,
          code: tournament.seriesTournaments[0].series.code,
        }
      : null;

    let standings: any[] =
      (leaderboard as any).data ||
      (leaderboard as any).standings ||
      (Array.isArray(leaderboard) ? leaderboard : []);

    if (query?.search) {
      const s = query.search.toLowerCase();
      standings = standings.filter(
        (item: any) =>
          item.gamertag?.toLowerCase().includes(s) ||
          item.name?.toLowerCase().includes(s) ||
          item.playerName?.toLowerCase().includes(s) ||
          item.player?.gamerTag?.toLowerCase().includes(s),
      );
    }

    const total = standings.length;
    const paginatedStandings = standings.slice(
      (page - 1) * limit,
      page * limit,
    );
    const pagination = calculatePaginationMeta(total, page, limit);

    const schedule = (tournament.schedule as any) || {};
    const rulesConfig = schedule.leaderboardRules || {};

    // The leaderboard service also exposes goal and analytics projections.
    // Return those projections without forcing the public client to rebuild
    // them from the schedule JSON.
    if (query?.filter && query.filter !== 'table') {
      return {
        tournamentId: tournament.tournamentId,
        tournamentName: tournament.name,
        tournamentFormat: tournament.tournamentFormat,
        rulesVersion: rulesConfig.rulesVersion || 1,
        tieBreakerRule: rulesConfig.tieBreakerRule || 'GOAL_DIFFERENCE',
        pointAdjustments: rulesConfig.pointAdjustments || {
          win: 3,
          draw: 1,
          loss: 0,
        },
        tournamentGroup,
        ...(leaderboard as any),
      };
    }

    return {
      tournamentId: tournament.tournamentId,
      tournamentName: tournament.name,
      tournamentFormat: tournament.tournamentFormat,
      rulesVersion: rulesConfig.rulesVersion || 1,
      tieBreakerRule: rulesConfig.tieBreakerRule || 'GOAL_DIFFERENCE',
      pointAdjustments: rulesConfig.pointAdjustments || {
        win: 3,
        draw: 1,
        loss: 0,
      },
      standings: paginatedStandings,
      tournamentLeaderboard: paginatedStandings, // Backward-compatibility
      tournamentGroup,
      seriesLeaderboard: [],
      pagination,
    };
  }

  async patchLeaderboardsTab(
    tournamentId: string,
    dto: UpdateLeaderboardsTabDto,
  ) {
    const tournament = await this.findTournamentOrThrow(tournamentId);

    const schedule = (tournament.schedule as any) || {};
    schedule.leaderboardRules = {
      rulesVersion:
        dto.rulesVersion || (schedule.leaderboardRules?.rulesVersion || 1) + 1,
      tieBreakerRule:
        dto.tieBreakerRule ||
        schedule.leaderboardRules?.tieBreakerRule ||
        'GOAL_DIFFERENCE',
      pointAdjustments: dto.pointAdjustments ||
        schedule.leaderboardRules?.pointAdjustments || {
          win: 3,
          draw: 1,
          loss: 0,
        },
    };

    await this.prisma.tournament.update({
      where: { tournamentId },
      data: {
        schedule,
        version: { increment: 1 },
      },
    });

    return this.getLeaderboardsTab(tournamentId);
  }

  // ==========================================
  // TAB 5: RAFFLES & GIVEAWAYS
  // ==========================================

  async getRafflesTab(tournamentId: string, query?: QueryTabRafflesDto) {
    await this.findTournamentOrThrow(tournamentId);

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Number(query?.limit) || 10);
    const skip = (page - 1) * limit;

    const [total, rawRaffles] = await Promise.all([
      this.prisma.raffle.count({ where: { tournamentId } }),
      this.prisma.raffle.findMany({
        where: { tournamentId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const raffles = rawRaffles.map((r) => {
      const entries = Array.isArray(r.entries) ? (r.entries as any[]) : [];
      const winners = Array.isArray(r.winners) ? (r.winners as any[]) : [];
      return {
        id: r.raffleId,
        raffleId: r.raffleId,
        name: r.name,
        prizeDescription: r.prizeDescription,
        numberOfWinners: r.numberOfWinners,
        status: r.status,
        drawDate: r.drawDate ? r.drawDate.toISOString() : null,
        registrationCloseDate: r.registrationCloseDate
          ? r.registrationCloseDate.toISOString()
          : null,
        eligibleEntriesCount: entries.length,
        winners,
        createdAt: r.createdAt.toISOString(),
      };
    });

    const pagination = calculatePaginationMeta(total, page, limit);

    return {
      tournamentId,
      raffles,
      pagination,
    };
  }

  async patchRafflesTab(tournamentId: string, dto: UpdateRafflesTabDto) {
    await this.findTournamentOrThrow(tournamentId);

    if (!dto.raffleId) {
      throw new BadRequestException(
        'raffleId is required when updating a raffle. Use the create raffle endpoint for new raffles.',
      );
    }

    const existingRaffle = await this.prisma.raffle.findFirst({
      where: { raffleId: dto.raffleId, tournamentId },
    });
    if (!existingRaffle) {
      throw new NotFoundException(
        `Raffle #${dto.raffleId} was not found in tournament #${tournamentId}`,
      );
    }

    const data: Prisma.RaffleUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.prizeDescription !== undefined)
      data.prizeDescription = dto.prizeDescription;
    if (dto.numberOfWinners !== undefined)
      data.numberOfWinners = dto.numberOfWinners;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.drawDate !== undefined) data.drawDate = new Date(dto.drawDate);
    if (dto.registrationCloseDate !== undefined)
      data.registrationCloseDate = parseRaffleRegistrationCloseDate(
        dto.registrationCloseDate,
      );

    await this.prisma.raffle.update({
      where: { raffleId: dto.raffleId },
      data,
    });

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

    const sponsors = await Promise.all(
      (tournament.sponsors || []).map(async (s) => {
        const presignedLogo = s.logo ? await safePresignUrl(s.logo) : null;
        return {
          id: s.sponsorId,
          sponsorId: s.sponsorId,
          name: s.name,
          logo: presignedLogo,
          logoUrl: presignedLogo,
          website: s.website || null,
          websiteUrl: s.website || null,
          tier: s.priority || 'GOLD',
          priority: s.priority || 'GOLD',
        };
      }),
    );

    return {
      tournamentId: tournament.tournamentId,
      tournamentLogo: presigned.tournamentLogo || null,
      tournamentBanner: presigned.tournamentBanner || null,
      primaryOrganization: presigned.primaryOrganization || null,
      secondaryOrganization: presigned.secondaryOrganization || null,
      fanPassLogo: presigned.fanPassLogo || null,
      fanPassBg: presigned.fanPassBg || null,
      organizerLogo: presigned.primaryOrganization || presigned.playerOrgUrl || null,
      secondaryOrganizerLogo: presigned.secondaryOrganization || presigned.prOrgUrl || null,
      canvasImage: presigned.fanPassBg || null,
      sponsors,
      playerCardTemplate: tournament.playerCardTemplate || null,
    };
  }

  async patchPlayerCardTemplateTab(
    tournamentId: string,
    dto: UpdatePlayerCardTemplateTabDto,
  ) {
    await this.findTournamentOrThrow(tournamentId);

    const data: Prisma.TournamentUpdateInput = {};
    const primaryOrgVal =
      dto.primaryOrganization ?? dto.playerOrgUrl ?? dto.organizerLogo;
    if (primaryOrgVal !== undefined) {
      data.primaryOrganization = extractStorageKey(primaryOrgVal);
      data.playerOrgUrl = data.primaryOrganization;
    }
    const secondaryOrgVal =
      dto.secondaryOrganization ?? dto.prOrgUrl ?? dto.secondaryOrganizerLogo;
    if (secondaryOrgVal !== undefined) {
      data.secondaryOrganization = extractStorageKey(secondaryOrgVal);
      data.prOrgUrl = data.secondaryOrganization;
    }
    const logoVal =
      dto.tournamentLogo ?? dto.tournamentLogoUrl ?? dto.logo;
    if (logoVal !== undefined) {
      data.tournamentLogo = extractStorageKey(logoVal);
      data.tournamentLogoUrl = data.tournamentLogo;
    }
    const bannerVal =
      dto.tournamentBanner ?? dto.bannerUrl ?? dto.banner;
    if (bannerVal !== undefined) {
      data.tournamentBanner = extractStorageKey(bannerVal);
    }
    if (dto.fanPassLogo !== undefined) {
      data.fanPassLogo = extractStorageKey(dto.fanPassLogo);
    }
    const fanBgVal = dto.fanPassBg ?? dto.fanPassArtUrl ?? dto.canvasImage;
    if (fanBgVal !== undefined) {
      data.fanPassBg = extractStorageKey(fanBgVal);
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
          const sponsorLogo = extractStorageKey(item.logo || item.logoUrl);
          if (item.sponsorId || item.id) {
            const sid = item.sponsorId || item.id;
            await this.prisma.sponsor.update({
              where: { sponsorId: sid },
              data: {
                name: item.name,
                logo: sponsorLogo,
                website: item.website || item.websiteUrl,
                priority: item.tier || item.priority,
                status: SponsorStatus.PLAYER,
              },
            });
          } else {
            await this.prisma.sponsor.create({
              data: {
                tournamentId,
                name: item.name,
                logo: sponsorLogo,
                website: item.website || item.websiteUrl,
                priority: item.tier || item.priority || 'GOLD',
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

    const sponsors = await Promise.all(
      (tournament.sponsors || []).map(async (s) => {
        const presignedLogo = s.logo ? await safePresignUrl(s.logo) : null;
        return {
          id: s.sponsorId,
          sponsorId: s.sponsorId,
          name: s.name,
          logo: presignedLogo,
          logoUrl: presignedLogo,
          website: s.website || null,
          websiteUrl: s.website || null,
          tier: s.priority || 'GOLD',
          priority: s.priority || 'GOLD',
        };
      }),
    );

    return {
      tournamentId: tournament.tournamentId,
      tournamentLogo: presigned.tournamentLogo || null,
      tournamentBanner: presigned.tournamentBanner || null,
      primaryOrganization: presigned.primaryOrganization || null,
      secondaryOrganization: presigned.secondaryOrganization || null,
      fanPassLogo: presigned.fanPassLogo || null,
      fanPassBg: presigned.fanPassBg || null,
      organizerLogo: presigned.primaryOrganization || presigned.playerOrgUrl || null,
      secondaryOrganizerLogo: presigned.secondaryOrganization || presigned.prOrgUrl || null,
      fanPassArtUrl: presigned.fanPassBg || null,
      canvasImage: presigned.fanPassBg || null,
      sponsors,
      fanPassTemplate: tournament.fanPassTemplate || null,
    };
  }

  async patchFanPassTemplateTab(
    tournamentId: string,
    dto: UpdateFanPassTemplateTabDto,
  ) {
    await this.findTournamentOrThrow(tournamentId);

    const data: Prisma.TournamentUpdateInput = {};
    const primaryOrgVal =
      dto.primaryOrganization ?? dto.playerOrgUrl ?? dto.organizerLogo;
    if (primaryOrgVal !== undefined) {
      data.primaryOrganization = extractStorageKey(primaryOrgVal);
      data.playerOrgUrl = data.primaryOrganization;
    }
    const secondaryOrgVal =
      dto.secondaryOrganization ?? dto.prOrgUrl ?? dto.secondaryOrganizerLogo;
    if (secondaryOrgVal !== undefined) {
      data.secondaryOrganization = extractStorageKey(secondaryOrgVal);
      data.prOrgUrl = data.secondaryOrganization;
    }
    if (dto.fanPassLogo !== undefined) {
      data.fanPassLogo = extractStorageKey(dto.fanPassLogo);
    }
    const fanBgVal = dto.fanPassBg ?? dto.fanPassArtUrl ?? dto.canvasImage;
    if (fanBgVal !== undefined) {
      data.fanPassBg = extractStorageKey(fanBgVal);
    }
    if (dto.tournamentLogo !== undefined) {
      data.tournamentLogo = extractStorageKey(dto.tournamentLogo);
      data.tournamentLogoUrl = data.tournamentLogo;
    }
    if (dto.tournamentBanner !== undefined) {
      data.tournamentBanner = extractStorageKey(dto.tournamentBanner);
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
          const sponsorLogo = extractStorageKey(item.logo || item.logoUrl);
          if (item.sponsorId || item.id) {
            const sid = item.sponsorId || item.id;
            await this.prisma.sponsor.update({
              where: { sponsorId: sid },
              data: {
                name: item.name,
                logo: sponsorLogo,
                website: item.website || item.websiteUrl,
                priority: item.tier || item.priority,
                status: SponsorStatus.FAN,
              },
            });
          } else {
            await this.prisma.sponsor.create({
              data: {
                tournamentId,
                name: item.name,
                logo: sponsorLogo,
                website: item.website || item.websiteUrl,
                priority: item.tier || item.priority || 'GOLD',
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
  // TAB 8: OFFICIAL RULES
  // ==========================================

  async getRulesTab(tournamentId: string) {
    const tournament = await this.findTournamentOrThrow(tournamentId);
    const presigned = await presignTournamentMedia(tournament as any);

    return {
      tournamentId: tournament.tournamentId,
      rules: presigned.rules || tournament.rules || [],
      rulesUrl: presigned.rules?.[0] || tournament.rules?.[0] || null,
    };
  }

  async patchRulesTab(tournamentId: string, dto: UpdateRulesTabDto) {
    await this.findTournamentOrThrow(tournamentId);

    const data: Prisma.TournamentUpdateInput = {};
    if (dto.rules !== undefined) {
      data.rules = normalizeStringArray(dto.rules).map((r) =>
        extractStorageKey(r),
      );
    } else if (dto.rulesUrl !== undefined) {
      data.rules = [extractStorageKey(dto.rulesUrl)];
    }

    data.version = { increment: 1 };

    await this.prisma.tournament.update({
      where: { tournamentId },
      data,
    });

    return this.getRulesTab(tournamentId);
  }

  // ==========================================
  // TAB 9: TERMS & CONDITIONS
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
      data.tsAndTc = normalizeStringArray(terms).map((t) =>
        extractStorageKey(t),
      );
    }

    data.version = { increment: 1 };

    await this.prisma.tournament.update({
      where: { tournamentId },
      data,
    });

    return this.getTermsTab(tournamentId);
  }

  // ==========================================
  // TAB 10: TOURNAMENT FULL SETTINGS
  // ==========================================

  async getSettingsTab(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      include: {
        venues: {
          include: { screens: true },
        },
        sponsors: true,
        manageEventCosts: true,
        manageEventPrizes: true,
      },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const venues = tournament.venues.map((v) => ({
      id: v.venueId,
      venueId: v.venueId,
      name: v.name,
      address: v.address,
      screens: v.screens.map((s) => s.screenName),
      screenObjects: v.screens.map((s) => ({
        id: s.screenId,
        name: s.screenName,
      })),
    }));

    const eventCosts = tournament.manageEventCosts.map((c) => ({
      id: c.manageEventCostId,
      manageEventCostId: c.manageEventCostId,
      name: c.costCategory,
      category: c.costCategory,
      amount: c.amount,
    }));

    const manageEventCosts = tournament.manageEventCosts.map((c) => ({
      id: c.manageEventCostId,
      costCategory: c.costCategory,
      amount: c.amount,
    }));

    const prizePayouts = tournament.manageEventPrizes.map((p, idx) => ({
      id: p.manageEventPrizeId,
      manageEventPrizeId: p.manageEventPrizeId,
      place: idx + 1,
      payout: p.amount,
      label: p.prizeCategory,
      percentage: tournament.percentage || 0,
      amount: p.amount,
    }));

    const manageEventPrizes = tournament.manageEventPrizes.map((p) => ({
      id: p.manageEventPrizeId,
      prizeCategory: p.prizeCategory,
      amount: p.amount,
    }));

    const presigned = await presignTournamentMedia(tournament as any);

    const sponsors = await Promise.all(
      (tournament.sponsors || []).map(async (sp) => {
        const presignedLogo = sp.logo ? await safePresignUrl(sp.logo) : '';
        return {
          id: sp.sponsorId,
          sponsorId: sp.sponsorId,
          name: sp.name,
          website: sp.website || '',
          priority: sp.priority || 'PRIMARY',
          tier: sp.priority || 'GOLD',
          value: sp.value ?? 0,
          status: sp.status || 'BOTH',
          contact: sp.contact || '',
          logo: presignedLogo || '',
          logoUrl: presignedLogo || '',
        };
      }),
    );

    const scheduleObj = (tournament.schedule as any) || {};
    const groupsCount =
      scheduleObj?.structure?.groups?.length ||
      (scheduleObj?.groups?.length ? scheduleObj.groups.length : 4);
    const thirdPlacePlayoffEnabled =
      scheduleObj?.structure?.thirdPlacePlayoffEnabled !== undefined
        ? scheduleObj.structure.thirdPlacePlayoffEnabled
        : true;
    const rulesList = Array.isArray(presigned.rules) ? presigned.rules : [];
    const tsAndTcList = Array.isArray(presigned.tsAndTc)
      ? presigned.tsAndTc
      : [];
    const formatName =
      tournament.tournamentFormat === 'SINGLE_ELIMINATION'
        ? 'Single Elimination'
        : tournament.tournamentFormat === 'DOUBLE_ELIMINATION'
          ? 'Double Elimination'
          : tournament.tournamentFormat === 'LEAGUE'
            ? 'League'
            : tournament.tournamentFormat;

    const playingDays = [1, 2, 3, 4, 5, 6, 0];
    const defaultFrequencyArray = [
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ];

    return {
      id: tournament.tournamentId,
      tournamentId: tournament.tournamentId,
      name: tournament.name,
      gameTitle: tournament.gameTitle,
      format: formatName,
      tournamentFormat: tournament.tournamentFormat,
      numberOfTeams: tournament.numberOfTeams,
      teams: tournament.numberOfTeams,
      capacity: tournament.capacity,
      maxCapacity: tournament.capacity,
      registrationCutOffMode: tournament.registrationCutOffMode || 'CAPACITY',
      registrationMode: tournament.registrationCutOffMode || 'CAPACITY',
      registrationOpen: tournament.registrationOpen,
      deadline: tournament.deadline ? tournament.deadline.toISOString() : null,
      deadlineDate: tournament.deadline
        ? tournament.deadline.toISOString()
        : null,
      paymentWindow: tournament.paymentWindow,
      paymentWindowHours: tournament.paymentWindow,
      groupsCount,
      thirdPlacePlayoffEnabled,
      requireJerseySize: tournament.requireJerseySize,
      couponCreation: tournament.couponCreation,
      status: tournament.status,
      isDraft: tournament.status === 'DRAFT',

      tournamentLogo: presigned.tournamentLogo || null,
      tournamentBanner: presigned.tournamentBanner || null,
      primaryOrganization: presigned.primaryOrganization || null,
      secondaryOrganization: presigned.secondaryOrganization || null,
      fanPassLogo: presigned.fanPassLogo || null,
      fanPassBg: presigned.fanPassBg || null,

      logo: presigned.tournamentLogo || presigned.tournamentLogoUrl || null,
      tournamentLogoUrl: presigned.tournamentLogo || presigned.tournamentLogoUrl || null,
      bannerUrl: presigned.tournamentBanner || presigned.canvasImage || null,
      canvasImage: presigned.tournamentBanner || presigned.canvasImage || null,
      organizerLogo: presigned.primaryOrganization || presigned.playerOrgUrl || null,
      secondaryOrganizerLogo: presigned.secondaryOrganization || presigned.prOrgUrl || null,
      fanPassArtUrl: presigned.fanPassBg || null,

      rulesUrl: rulesList[0] || null,
      rules: rulesList,
      termsAndConditionsUrl: tsAndTcList[0] || null,
      termsAndConditions: tsAndTcList,
      playerOrgUrl: presigned.playerOrgUrl || null,
      prOrgUrl: presigned.prOrgUrl || null,

      entryFee: tournament.entryFee,
      currency: tournament.currency,
      prizeRule: tournament.prizeRule,
      percentage: tournament.percentage,
      houseRake: tournament.houseRake ?? 0,
      houseRakePercent: tournament.houseRake ?? 0,
      prizePoolConfig: {
        type:
          tournament.prizeRule === 'FIXED_AMOUNT' ? 'fixed' : 'percentage',
        value: tournament.percentage ?? 70,
      },
      eventCosts,
      manageEventCosts,
      prizePayouts,
      manageEventPrizes,

      venues,

      schedulingMode: tournament.schedulingMode,
      schedulingWindowOpen: !tournament.schedulingPaused,
      startDate: tournament.startDate
        ? tournament.startDate.toISOString()
        : null,
      dailyStart: tournament.dailyStart || '09:00',
      dailyEnd: tournament.dailyEnd || '17:00',
      matchDuration: tournament.matchDuration || 20,
      turnoverDuration: tournament.turnoverDuration || 5,
      lunchBreakTime: tournament.lunchBreakTime || '13:00',
      lunchDuration: tournament.lunchDuration || 60,
      scheduleSettings: {
        startDate: tournament.startDate
          ? tournament.startDate.toISOString()
          : null,
        eventStartTime: tournament.dailyStart || '09:00',
        eventEndTime: tournament.dailyEnd || '17:00',
        slotDuration: tournament.matchDuration || 20,
        turnoverDuration: tournament.turnoverDuration || 5,
        lunchBreakStartTime: tournament.lunchBreakTime || '13:00',
        lunchBreakDuration: tournament.lunchDuration || 60,
      },

      frequencyStatus: tournament.frequencyStatus || 'DAILY',
      buffer: tournament.buffer || 0,
      playingDays,
      frequencyArray:
        tournament.frequencyArray && tournament.frequencyArray.length > 0
          ? tournament.frequencyArray
          : defaultFrequencyArray,
      frequencySettings: {
        frequency: tournament.frequencyStatus || 'DAILY',
        buffer: tournament.buffer || 0,
        playingDays,
      },

      sponsors,
    };
  }

  async patchSettingsTab(tournamentId: string, dto: UpdateSettingsTabDto) {
    await this.findTournamentOrThrow(tournamentId);

    const data: Prisma.TournamentUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.gameTitle !== undefined) data.gameTitle = dto.gameTitle;
    if (dto.gameType !== undefined) data.gameType = dto.gameType;
    if (dto.format !== undefined) data.tournamentFormat = dto.format;
    if (dto.tournamentFormat !== undefined)
      data.tournamentFormat = dto.tournamentFormat;
    if (dto.registrationMode !== undefined)
      data.registrationCutOffMode = dto.registrationMode;
    if (dto.registrationCutOffMode !== undefined)
      data.registrationCutOffMode = dto.registrationCutOffMode;
    if (dto.maxCapacity !== undefined || dto.capacity !== undefined) {
      data.capacity = dto.maxCapacity ?? dto.capacity;
      data.numberOfTeams = dto.maxCapacity ?? dto.capacity;
    }
    if (dto.numberOfTeams !== undefined) data.numberOfTeams = dto.numberOfTeams;
    if (dto.entryFee !== undefined) data.entryFee = dto.entryFee;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.paymentWindow !== undefined) data.paymentWindow = dto.paymentWindow;
    if (dto.prizeRule !== undefined) data.prizeRule = dto.prizeRule;
    if (dto.percentage !== undefined) data.percentage = dto.percentage;
    if (dto.prizePoolConfig) {
      if (dto.prizePoolConfig.type)
        data.prizeRule = mapPrizeRule(dto.prizePoolConfig.type);
      if (dto.prizePoolConfig.value !== undefined)
        data.percentage = Number(dto.prizePoolConfig.value);
    }
    if (dto.houseRake !== undefined) data.houseRake = dto.houseRake;
    if (dto.houseRakePercent !== undefined)
      data.houseRake = dto.houseRakePercent;
    if (dto.couponCreation !== undefined)
      data.couponCreation = dto.couponCreation;
    if (dto.registrationOpen !== undefined)
      data.registrationOpen = dto.registrationOpen;
    if (dto.requireJerseySize !== undefined)
      data.requireJerseySize = dto.requireJerseySize;

    if (dto.deadlineDate !== undefined)
      data.deadline = new Date(dto.deadlineDate);
    if (dto.deadline !== undefined) data.deadline = new Date(dto.deadline);
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.schedulingMode !== undefined)
      data.schedulingMode = dto.schedulingMode;
    if (dto.isDraft === true) data.status = TournamentStatus.DRAFT;
    else if (dto.status !== undefined) data.status = dto.status;
    if (dto.schedulingWindowOpen !== undefined)
      data.schedulingPaused = !dto.schedulingWindowOpen;

    if (dto.dailyStart !== undefined) data.dailyStart = dto.dailyStart;
    if (dto.dailyEnd !== undefined) data.dailyEnd = dto.dailyEnd;
    if (dto.matchDuration !== undefined) data.matchDuration = dto.matchDuration;
    if (dto.turnoverDuration !== undefined)
      data.turnoverDuration = dto.turnoverDuration;
    if (dto.buffer !== undefined) data.buffer = dto.buffer;
    if (dto.lunchBreakTime !== undefined)
      data.lunchBreakTime = dto.lunchBreakTime;
    if (dto.lunchDuration !== undefined) data.lunchDuration = dto.lunchDuration;
    if (dto.frequencyStatus !== undefined)
      data.frequencyStatus = dto.frequencyStatus;
    if (dto.frequencyArray !== undefined)
      data.frequencyArray = dto.frequencyArray;

    const bannerVal =
      dto.tournamentBanner ?? dto.canvasImage ?? dto.bannerUrl ?? dto.banner;
    if (bannerVal !== undefined) {
      data.tournamentBanner = extractStorageKey(bannerVal);
      data.canvasImage = data.tournamentBanner;
    }

    const logoVal =
      dto.tournamentLogo ?? dto.tournamentLogoUrl ?? dto.logo;
    if (logoVal !== undefined) {
      data.tournamentLogo = extractStorageKey(logoVal);
      data.tournamentLogoUrl = data.tournamentLogo;
    }

    const primaryOrgVal =
      dto.primaryOrganization ?? dto.playerOrgUrl ?? dto.organizerLogo;
    if (primaryOrgVal !== undefined) {
      data.primaryOrganization = extractStorageKey(primaryOrgVal);
      data.playerOrgUrl = data.primaryOrganization;
    }

    const prOrgVal =
      dto.secondaryOrganization ?? dto.prOrgUrl ?? dto.secondaryOrganizerLogo;
    if (prOrgVal !== undefined) {
      data.secondaryOrganization = extractStorageKey(prOrgVal);
      data.prOrgUrl = data.secondaryOrganization;
    }

    if (dto.fanPassLogo !== undefined) {
      data.fanPassLogo = extractStorageKey(dto.fanPassLogo);
    }

    const fanBgVal = dto.fanPassBg ?? dto.fanPassArtUrl;
    if (fanBgVal !== undefined) {
      data.fanPassBg = extractStorageKey(fanBgVal);
    }

    if (dto.rulesUrl !== undefined)
      data.rules = [extractStorageKey(dto.rulesUrl)];
    if (dto.rules !== undefined)
      data.rules = normalizeStringArray(dto.rules).map((r) =>
        extractStorageKey(r),
      );
    if (dto.termsAndConditionsUrl !== undefined)
      data.tsAndTc = [extractStorageKey(dto.termsAndConditionsUrl)];
    if (dto.termsAndConditions !== undefined)
      data.tsAndTc = normalizeStringArray(dto.termsAndConditions).map((t) =>
        extractStorageKey(t),
      );
    if (dto.tsAndTc !== undefined)
      data.tsAndTc = normalizeStringArray(dto.tsAndTc).map((t) =>
        extractStorageKey(t),
      );

    if (dto.scheduleSettings) {
      if (dto.scheduleSettings.dailyStart !== undefined)
        data.dailyStart = dto.scheduleSettings.dailyStart;
      if (dto.scheduleSettings.eventStartTime !== undefined)
        data.dailyStart = dto.scheduleSettings.eventStartTime;
      if (dto.scheduleSettings.dailyEnd !== undefined)
        data.dailyEnd = dto.scheduleSettings.dailyEnd;
      if (dto.scheduleSettings.eventEndTime !== undefined)
        data.dailyEnd = dto.scheduleSettings.eventEndTime;
      if (dto.scheduleSettings.matchDuration !== undefined)
        data.matchDuration = dto.scheduleSettings.matchDuration;
      if (dto.scheduleSettings.slotDuration !== undefined)
        data.matchDuration = dto.scheduleSettings.slotDuration;
      if (dto.scheduleSettings.turnoverDuration !== undefined)
        data.turnoverDuration = dto.scheduleSettings.turnoverDuration;
      if (dto.scheduleSettings.buffer !== undefined)
        data.buffer = dto.scheduleSettings.buffer;
      if (dto.scheduleSettings.lunchBreakTime !== undefined)
        data.lunchBreakTime = dto.scheduleSettings.lunchBreakTime;
      if (dto.scheduleSettings.lunchBreakStartTime !== undefined)
        data.lunchBreakTime = dto.scheduleSettings.lunchBreakStartTime;
      if (dto.scheduleSettings.lunchDuration !== undefined)
        data.lunchDuration = dto.scheduleSettings.lunchDuration;
      if (dto.scheduleSettings.lunchBreakDuration !== undefined)
        data.lunchDuration = dto.scheduleSettings.lunchBreakDuration;
      if (dto.scheduleSettings.startDate !== undefined)
        data.startDate = new Date(dto.scheduleSettings.startDate);
    }

    if (dto.frequencySettings) {
      if (dto.frequencySettings.frequencyStatus !== undefined)
        data.frequencyStatus = dto.frequencySettings.frequencyStatus;
      if (dto.frequencySettings.frequency !== undefined)
        data.frequencyStatus = dto.frequencySettings.frequency;
      if (dto.frequencySettings.frequencyArray !== undefined)
        data.frequencyArray = dto.frequencySettings.frequencyArray;
      if (dto.frequencySettings.buffer !== undefined)
        data.buffer = dto.frequencySettings.buffer;
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
          const venueId = v.id || v.venueId;
          const rawScreens =
            v.screens && Array.isArray(v.screens) ? v.screens : [];
          if (venueId) {
            await this.prisma.venue.update({
              where: { venueId },
              data: {
                name: v.name,
                address: v.address || v.name,
                tournamentId,
              },
            });
            if (rawScreens.length > 0) {
              const existingScreens = await this.prisma.screen.findMany({
                where: { venueId },
              });
              const existingScreenNames = new Set(
                existingScreens.map((s) => s.screenName),
              );
              for (const s of rawScreens) {
                const screenName =
                  typeof s === 'string'
                    ? s
                    : s?.name || s?.screenName || 'Screen';
                if (!existingScreenNames.has(screenName)) {
                  await this.prisma.screen.create({
                    data: { venueId, screenName },
                  });
                }
              }
            }
          } else {
            const screens = rawScreens.map((s: any) => ({
              screenName:
                typeof s === 'string' ? s : s?.name || s?.screenName || 'Screen',
            }));
            await this.prisma.venue.create({
              data: {
                tournamentId,
                name: v.name,
                address: v.address || v.name,
                ...(screens.length > 0 && {
                  screens: {
                    create: screens,
                  },
                }),
              },
            });
          }
        }
      }
    }

    // Costs sync if provided
    const costsList = dto.eventCosts || dto.manageEventCosts;
    if (Array.isArray(costsList)) {
      for (const c of costsList) {
        if (
          typeof c === 'object' &&
          c !== null &&
          (c.category || c.costCategory || c.name) &&
          c.amount !== undefined
        ) {
          const category = c.costCategory || c.category || c.name;
          const costId = c.id || c.manageEventCostId;
          if (costId) {
            await this.prisma.manageEventCost.update({
              where: { manageEventCostId: costId },
              data: {
                costCategory: category,
                amount: Number(c.amount),
                tournamentId,
              },
            });
          } else {
            await this.prisma.manageEventCost.create({
              data: {
                tournamentId,
                costCategory: category,
                amount: Number(c.amount),
              },
            });
          }
        }
      }
    }

    // Prizes sync if provided
    const prizesList = dto.prizePayouts || dto.manageEventPrizes;
    if (Array.isArray(prizesList)) {
      for (const p of prizesList) {
        if (
          typeof p === 'object' &&
          p !== null &&
          (p.prizeCategory ||
            p.category ||
            p.label ||
            p.place !== undefined) &&
          (p.amount !== undefined || p.payout !== undefined)
        ) {
          const category =
            p.prizeCategory ||
            p.label ||
            p.category ||
            `Place ${p.place || 1}`;
          const amount =
            Number(p.amount !== undefined ? p.amount : p.payout) || 0;
          const prizeId = p.id || p.manageEventPrizeId;
          if (prizeId) {
            await this.prisma.manageEventPrize.update({
              where: { manageEventPrizeId: prizeId },
              data: { prizeCategory: category, amount, tournamentId },
            });
          } else {
            await this.prisma.manageEventPrize.create({
              data: {
                tournamentId,
                prizeCategory: category,
                amount,
              },
            });
          }
        }
      }
    }

    // Sponsors sync if provided
    if (Array.isArray(dto.sponsors)) {
      for (const sp of dto.sponsors) {
        if (typeof sp === 'object' && sp !== null && sp.name) {
          const sponsorId = sp.id || sp.sponsorId;
          const sponsorData = {
            name: sp.name,
            logo: extractStorageKey(sp.logo || sp.logoUrl),
            website: sp.website,
            priority: sp.priority || sp.tier,
            contact: sp.contact,
            value: sp.value !== undefined ? Number(sp.value) : undefined,
            status: sp.status || SponsorStatus.BOTH,
            tournamentId,
          };
          if (sponsorId) {
            await this.prisma.sponsor.update({
              where: { sponsorId },
              data: sponsorData,
            });
          } else {
            await this.prisma.sponsor.create({
              data: sponsorData,
            });
          }
        }
      }
    }

    return this.getSettingsTab(tournamentId);
  }

  // ==========================================
  // DYNAMIC TAB DISPATCHER (:tabName)
  // ==========================================

  async getTab(tournamentId: string, tabName: string, query?: any) {
    const normalized = tabName.toLowerCase().replace(/[-_&]/g, '');
    switch (normalized) {
      case 'details':
        return this.getDetailsTab(tournamentId);
      case 'registrations':
      case 'registration':
        return this.getRegistrationsTab(tournamentId, query);
      case 'schedule':
      case 'scheduleresults':
      case 'scheduleresult':
        return this.getScheduleTab(tournamentId, query);
      case 'leaderboard':
      case 'leaderboards':
        return this.getLeaderboardsTab(tournamentId, query);
      case 'raffles':
      case 'raffle':
        return this.getRafflesTab(tournamentId, query);
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
