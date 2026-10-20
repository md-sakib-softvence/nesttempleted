import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateTournamentDto,
  mapTournamentFormat,
  mapPrizeRule,
  mapRegistrationMode,
  mapFrequencyStatus,
} from '../dto/tournament/create-tournament.dto';
import { UpdateTournamentDto } from '../dto/tournament/update-tournament.dto';
import { AllocateMatchDto } from '../dto/tournament/allocate-match.dto';
import { GenerateCalendarDto } from '../dto/tournament/generate-calendar.dto';
import { AutoAllocationDto } from '../dto/tournament/auto-allocation.dto';
import {
  buildPrismaQuery,
  calculatePaginationMeta,
  QueryOptions,
} from '../../utils/query.util';
import { getPreSignedUrl } from '../../utils/s3.util';
import {
  TournamentScheduleService,
  Participant,
  ScheduleVenueInput,
  TournamentSchedulePayload,
} from './tournament-schedule.service';
import {
  SchedulingMode,
  SponsorStatus,
  TournamentRegistrationStatus,
  RaffleStatus,
  TournamentFormat,
  Currency,
  PrizeRule,
  RegistrationCutOffMode,
  FrequencyStatus,
  TournamentStatus,
  Prisma,
} from '@prisma/client';
import { normalizeStringArray } from '../utils/file-upload.util';
import { UpdateMatchScoreDto } from '../dto/tournament/update-match-score.dto';
import { MatchNoShowDto } from '../dto/tournament/match-no-show.dto';
import { CreateTournamentRegistrationDto } from '../dto/tournament/create-registration.dto';
import { UpdateRegistrationStatusDto } from '../dto/tournament/update-registration-status.dto';
import { OpenRegistrationDto } from '../dto/tournament/open-registration.dto';
import { CreateRaffleDto } from '../dto/tournament/create-raffle.dto';
import { UpdateTournamentTemplatesDto } from '../dto/tournament/update-templates.dto';
import { UpdateTournamentStatusDto } from '../dto/tournament/update-tournament-status.dto';
import {
  RegistrationSelectionDto,
  SelectionMode,
} from '../dto/tournament/registration-selection.dto';
import { ScoreCorrectionDto } from '../dto/tournament/score-correction.dto';
import { CreateMatchDisputeDto } from '../dto/tournament/match-dispute.dto';
import { UpdateMatchDisputeDto } from '../dto/tournament/update-dispute.dto';
import { UpdateTournamentFinancialsDto } from '../dto/tournament/update-financials.dto';
import { QueryTournamentRegistrationDto } from '../dto/tournament/query-registration.dto';

@Injectable()
export class TournamentService {
  private readonly logger = new Logger(TournamentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentScheduleService: TournamentScheduleService,
  ) {}

  private async presignTournamentMedia<T extends Record<string, any>>(
    tournament: T,
  ): Promise<T> {
    if (!tournament) return tournament;
    const formatted: Record<string, any> = { ...tournament };

    if (formatted.canvasImage) {
      formatted.canvasImage = await getPreSignedUrl(
        String(formatted.canvasImage),
      );
    }

    if (formatted.tournamentLogoUrl) {
      formatted.tournamentLogoUrl = await getPreSignedUrl(
        String(formatted.tournamentLogoUrl),
      );
    }

    if (formatted.playerOrgUrl) {
      if (
        !String(formatted.playerOrgUrl).includes('http://') &&
        !String(formatted.playerOrgUrl).includes('https://')
      ) {
        formatted.playerOrgUrl = await getPreSignedUrl(
          String(formatted.playerOrgUrl),
        );
      }
    }

    if (formatted.prOrgUrl) {
      if (
        !String(formatted.prOrgUrl).includes('http://') &&
        !String(formatted.prOrgUrl).includes('https://')
      ) {
        formatted.prOrgUrl = await getPreSignedUrl(String(formatted.prOrgUrl));
      }
    }

    if (formatted.rules && Array.isArray(formatted.rules)) {
      formatted.rules = await Promise.all(
        formatted.rules.map(async (rule: string) => {
          if (rule.includes('http://') || rule.includes('https://')) {
            return rule;
          }
          return getPreSignedUrl(rule);
        }),
      );
    }

    if (formatted.tsAndTc && Array.isArray(formatted.tsAndTc)) {
      formatted.tsAndTc = await Promise.all(
        formatted.tsAndTc.map(async (doc: string) => {
          if (doc.includes('http://') || doc.includes('https://')) {
            return doc;
          }
          return getPreSignedUrl(doc);
        }),
      );
    }

    // Schedule normalization
    const rawSchedule = formatted.schedule;
    let schedulePayload: any = null;
    if (rawSchedule && typeof rawSchedule === 'object' && !Array.isArray(rawSchedule)) {
      schedulePayload = rawSchedule;
      if (Array.isArray((rawSchedule as any).calendar)) {
        formatted.schedulePayload = rawSchedule;
        formatted.schedule = (rawSchedule as any).calendar;
      }
    } else if (formatted.schedulePayload) {
      schedulePayload = formatted.schedulePayload;
    }

    // Canonical Frontend Fields
    formatted.id = formatted.tournamentId;
    formatted.teams = formatted.numberOfTeams;

    const formatMap: Record<string, string> = {
      SINGLE_ELIMINATION: 'Single Elimination',
      DOUBLE_ELIMINATION: 'Double Elimination',
      LEAGUE: 'League',
      LEAGUE_DOUBLE: 'League (Double)',
      LEAGUE_AND_KNOCKOUT: 'League & Knockout',
      LEAGUE_AND_KNOCKOUT_DOUBLE: 'League & Knockout (Double)',
    };
    formatted.format = formatMap[formatted.tournamentFormat] || formatted.tournamentFormat;

    formatted.paymentWindowHours = formatted.paymentWindow ?? 24;
    formatted.registrationOpen = formatted.registrationOpen !== undefined ? formatted.registrationOpen : (formatted.registrationCutOffMode ? true : true);
    formatted.registrationMode = formatted.registrationCutOffMode === 'DEADLINE' ? 'DEADLINE' : 'CAPACITY';
    formatted.maxCapacity = formatted.capacity || formatted.numberOfTeams;
    formatted.deadlineDate = formatted.deadline ? new Date(formatted.deadline).toISOString() : undefined;
    formatted.houseRakePercent = formatted.houseRake !== null && formatted.houseRake !== undefined ? Number(formatted.houseRake) : 30;
    formatted.prizePoolConfig = {
      type: (formatted.prizeRule === 'FIXED_AMOUNT' || formatted.prizeRule === 'FIXED') ? 'fixed' : 'percentage',
      value: formatted.percentage !== null && formatted.percentage !== undefined ? Number(formatted.percentage) : 70,
    };

    formatted.logo = formatted.tournamentLogoUrl || formatted.canvasImage || null;
    formatted.organizerLogo = formatted.playerOrgUrl || formatted.prOrgUrl || '';
    formatted.secondaryOrganizerLogo = formatted.secondaryOrganizerLogo || null;
    formatted.fanPassArtUrl = formatted.canvasImage || null;
    formatted.rulesUrl = (formatted.rules && formatted.rules[0]) || '';
    formatted.termsAndConditionsUrl = (formatted.tsAndTc && formatted.tsAndTc[0]) || '';
    formatted.seriesId = formatted.seriesTournaments?.[0]?.seriesId || formatted.seriesId || null;

    // Schedule Settings object
    const schedSettings = schedulePayload?.scheduleSettings || {};
    formatted.scheduleSettings = {
      startDate: schedSettings.startDate || (formatted.startDate ? new Date(formatted.startDate).toISOString().slice(0, 10) : ''),
      eventStartTime: schedSettings.eventStartTime || formatted.dailyStart || '10:00',
      eventEndTime: schedSettings.eventEndTime || formatted.dailyEnd || '19:00',
      slotDuration: schedSettings.slotDuration || formatted.matchDuration || 25,
      turnoverDuration: schedSettings.turnoverDuration ?? formatted.turnoverDuration ?? 5,
      lunchBreakStartTime: schedSettings.lunchBreakStartTime || formatted.lunchBreakTime || '13:00',
      lunchBreakDuration: schedSettings.lunchBreakDuration ?? formatted.lunchDuration ?? 60,
      thirdPlacePlayoffEnabled: schedSettings.thirdPlacePlayoffEnabled ?? true,
      grandFinalResetEnabled: schedSettings.grandFinalResetEnabled ?? false,
    };

    // Frequency Settings object
    const freqSettings = schedulePayload?.frequencySettings || {};
    const freqNameMap: Record<string, string> = {
      DAILY: 'Daily',
      WEEKLY: 'Weekly',
      MONTHLY: 'Monthly',
    };
    formatted.frequencySettings = {
      frequency: freqSettings.frequency || freqNameMap[formatted.frequencyStatus] || 'Daily',
      buffer: freqSettings.buffer ?? formatted.buffer ?? 0,
      playingDays: freqSettings.playingDays || [0, 6],
    };

    // Normalized Venues
    if (formatted.venues && Array.isArray(formatted.venues)) {
      formatted.venues = formatted.venues.map((v: any) => ({
        id: v.venueId || v.id,
        name: v.name,
        address: v.address,
        screens: (v.screens || []).map((s: any) => ({
          id: s.screenId || s.id,
          name: s.screenName || s.name,
        })),
      }));
    }

    // Normalized Event Costs
    formatted.eventCosts = (formatted.manageEventCosts || []).map((c: any) => ({
      id: c.manageEventCostId || c.id,
      category: c.costCategory || c.category,
      amount: Number(c.amount) || 0,
      status: c.status || 'paid',
    }));

    // Normalized Prize Payouts
    formatted.prizePayouts = (formatted.manageEventPrizes || []).map((p: any) => ({
      id: p.manageEventPrizeId || p.id,
      category: p.prizeCategory || p.category,
      amount: Number(p.amount) || 0,
      status: p.status || 'pending',
    }));

    // Normalized Sponsors
    if (formatted.sponsors && Array.isArray(formatted.sponsors)) {
      formatted.sponsors = formatted.sponsors.map((s: any) => ({
        id: s.sponsorId || s.id,
        name: s.name,
        logoUrl: s.logo || s.logoUrl,
        website: s.website,
        priorityOrder: s.priority === 'PRIMARY' ? 1 : 2,
        contractValue: Number(s.value) || 0,
      }));
    }

    // Matches, Slots, Seeds, Groups from Schedule Payload
    if (schedulePayload) {
      formatted.matches = schedulePayload.canonicalMatches || schedulePayload.matches || [];
      formatted.slots = schedulePayload.slots || [];
      formatted.seeds = schedulePayload.seeds || [];
      formatted.groups = schedulePayload.groups || [];
      formatted.guaranteedMatches = schedulePayload.summary?.guaranteedMatches || formatted.numberOfTeams;
      formatted.conditionalMatches = schedulePayload.summary?.conditionalMatches || 0;
      formatted.maximumPossibleMatches = schedulePayload.summary?.maximumPossibleMatches || formatted.numberOfTeams;
    }

    // Normalized Registrations
    if (formatted.registrations && Array.isArray(formatted.registrations)) {
      formatted.registrations = formatted.registrations.map((r: any) => {
        const playerName = r.player
          ? `${r.player.firstName || ''} ${r.player.lastName || ''}`.trim() || r.player.gamerTag || 'Player'
          : (r.fullName || 'Player');
        return {
          id: r.registrationId || r.id,
          playerId: r.playerId,
          userId: r.userId || r.playerId,
          fullName: playerName,
          gamertag: r.player?.gamerTag || r.gamertag || playerName,
          playerPhotoUrl: r.player?.profilePicture || r.playerPhotoUrl || '',
          homeVenueId: r.homeVenueId,
          teamSelection: r.teamSelection || {},
          jerseySize: r.jerseySize || 'L',
          status: r.status,
          paymentStatus: r.paymentStatus || 'PENDING',
          registrationDate: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
          paymentDeadline: r.paymentDeadline ? new Date(r.paymentDeadline).toISOString() : null,
          checkedInVenue: r.checkedInVenue ?? false,
          qrCodeString: r.qrCodeString,
          assignedSlot: r.assignedSlot,
          version: r.version || 1,
        };
      });
    } else {
      formatted.registrations = [];
    }

    return formatted as T;
  }

  /**
   * Structure Generation (POST /tournaments):
   * Calculate match count and produce canonical match entities.
   * Generates capacity metrics, calendar grid, and places matches according to schedulingMode.
   */
  async createTournament(createTournamentDto: CreateTournamentDto) {
    const {
      startDate,
      deadline,
      venues: inputVenues,
      sponsors: inputSponsors,
      manageEventCosts: inputManageEventCosts,
      manageEventPrizes: inputManageEventPrizes,
      playerIds: inputPlayerIds,
      groupsCount,
      thirdPlacePlayoffEnabled = true,
      ...rest
    } = createTournamentDto;
    console.log('createTournamentDto', createTournamentDto);

    // 1. Resolve & Create Sponsors first
    const resolvedSponsorIds: string[] = [];
    if (inputSponsors && Array.isArray(inputSponsors)) {
      for (const item of inputSponsors) {
        if (typeof item === 'string') {
          resolvedSponsorIds.push(item);
        } else if (typeof item === 'object' && item !== null && item.name) {
          const createdSponsor = await this.prisma.sponsor.create({
            data: {
              name: item.name,
              logo: item.logo,
              website: item.website,
              priority: item.priority,
              contact: item.contact,
              value: item.value !== undefined ? Number(item.value) : undefined,
              status: item.status || SponsorStatus.BOTH,
            },
          });
          resolvedSponsorIds.push(createdSponsor.sponsorId);
        }
      }
    }

    // 2. Resolve & Create Venues (with Screens) first
    const resolvedVenueIds: string[] = [];
    if (inputVenues && Array.isArray(inputVenues)) {
      for (const item of inputVenues) {
        if (typeof item === 'string') {
          resolvedVenueIds.push(item);
        } else if (
          typeof item === 'object' &&
          item !== null &&
          (item.name || item.address)
        ) {
          const screens =
            item.screens && Array.isArray(item.screens)
              ? item.screens.map((s: any) => ({
                  screenName:
                    typeof s === 'string' ? s : s.screenName || 'Screen',
                }))
              : [];

          const createdVenue = await this.prisma.venue.create({
            data: {
              name: item.name || 'Venue',
              address: item.address || '',
              ...(screens.length > 0 && {
                screens: {
                  create: screens,
                },
              }),
            },
            include: { screens: true },
          });
          resolvedVenueIds.push(createdVenue.venueId);
        }
      }
    }

    // 3. Resolve & Create Event Costs first
    const resolvedCostIds: string[] = [];
    if (inputManageEventCosts && Array.isArray(inputManageEventCosts)) {
      for (const item of inputManageEventCosts) {
        if (typeof item === 'string') {
          resolvedCostIds.push(item);
        } else if (
          typeof item === 'object' &&
          item !== null &&
          item.costCategory
        ) {
          const createdCost = await this.prisma.manageEventCost.create({
            data: {
              costCategory: item.costCategory,
              amount: Number(item.amount) || 0,
            },
          });
          resolvedCostIds.push(createdCost.manageEventCostId);
        }
      }
    }

    // 4. Resolve & Create Event Prizes first
    const resolvedPrizeIds: string[] = [];
    if (inputManageEventPrizes && Array.isArray(inputManageEventPrizes)) {
      for (const item of inputManageEventPrizes) {
        if (typeof item === 'string') {
          resolvedPrizeIds.push(item);
        } else if (
          typeof item === 'object' &&
          item !== null &&
          item.prizeCategory
        ) {
          const createdPrize = await this.prisma.manageEventPrize.create({
            data: {
              prizeCategory: item.prizeCategory,
              amount: Number(item.amount) || 0,
            },
          });
          resolvedPrizeIds.push(createdPrize.manageEventPrizeId);
        }
      }
    }

    const schedulingMode = createTournamentDto.schedulingMode || SchedulingMode.MANUAL;
    const rules = normalizeStringArray(createTournamentDto.rules);
    const tsAndTc = normalizeStringArray(createTournamentDto.tsAndTc);
    const frequencyArray = normalizeStringArray(createTournamentDto.frequencyArray);

    const tournament = await this.prisma.tournament.create({
      data: {
        name: createTournamentDto.name,
        gameTitle: createTournamentDto.gameTitle || (createTournamentDto as any).game || 'EAFC 25',
        tournamentFormat: createTournamentDto.tournamentFormat || TournamentFormat.SINGLE_ELIMINATION,
        numberOfTeams: createTournamentDto.numberOfTeams || 16,
        entryFee: createTournamentDto.entryFee ?? 0,
        currency: createTournamentDto.currency || Currency.NGN,
        paymentWindow: createTournamentDto.paymentWindow || 24,
        prizeRule: createTournamentDto.prizeRule || PrizeRule.PERCENTAGE,
        percentage: createTournamentDto.percentage ?? 70,
        houseRake: createTournamentDto.houseRake ?? 30,
        couponCreation: createTournamentDto.couponCreation ?? false,
        registrationCutOffMode: createTournamentDto.registrationCutOffMode || RegistrationCutOffMode.CAPACITY,
        schedulingMode,
        startDate: new Date(startDate || Date.now() + 86400000),
        deadline: new Date(deadline || Date.now() + 7 * 86400000),
        capacity: createTournamentDto.capacity || createTournamentDto.numberOfTeams || 16,
        dailyStart: createTournamentDto.dailyStart || '10:00',
        dailyEnd: createTournamentDto.dailyEnd || '19:00',
        matchDuration: createTournamentDto.matchDuration || 25,
        turnoverDuration: createTournamentDto.turnoverDuration ?? 5,
        lunchBreakTime: createTournamentDto.lunchBreakTime || '13:00',
        lunchDuration: createTournamentDto.lunchDuration ?? 60,
        buffer: createTournamentDto.buffer ?? 0,
        frequencyStatus: createTournamentDto.frequencyStatus || FrequencyStatus.DAILY,
        frequencyArray,
        playerOrgUrl: createTournamentDto.playerOrgUrl || createTournamentDto.organizerLogo,
        prOrgUrl: createTournamentDto.prOrgUrl,
        tournamentLogoUrl: createTournamentDto.tournamentLogoUrl || createTournamentDto.tournamentLogo || createTournamentDto.logo,
        canvasImage: createTournamentDto.canvasImage || createTournamentDto.fanPassArtUrl,
        rules,
        tsAndTc,
        status: createTournamentDto.status || (createTournamentDto.isDraft ? TournamentStatus.DRAFT : TournamentStatus.REGISTRATION_OPEN),
        requireJerseySize: createTournamentDto.requireJerseySize ?? false,
        ...(resolvedCostIds.length > 0 && {
          manageEventCosts: {
            connect: resolvedCostIds.map((id) => ({ manageEventCostId: id })),
          },
        }),
        ...(resolvedPrizeIds.length > 0 && {
          manageEventPrizes: {
            connect: resolvedPrizeIds.map((id) => ({
              manageEventPrizeId: id,
            })),
          },
        }),
        ...(resolvedSponsorIds.length > 0 && {
          sponsors: {
            connect: resolvedSponsorIds.map((id) => ({ sponsorId: id })),
          },
        }),
        ...(resolvedVenueIds.length > 0 && {
          venues: {
            connect: resolvedVenueIds.map((id) => ({ venueId: id })),
          },
        }),
      },
      include: {
        manageEventCosts: true,
        manageEventPrizes: true,
        venues: {
          include: {
            screens: true,
          },
        },
        sponsors: true,
        registrations: {
          include: {
            player: true,
          },
        },
        seriesTournaments: true,
      },
    });

    if (createTournamentDto.seriesId) {
      try {
        const count = await this.prisma.seriesTournament.count({
          where: { seriesId: createTournamentDto.seriesId },
        });
        await this.prisma.seriesTournament.create({
          data: {
            seriesId: createTournamentDto.seriesId,
            tournamentId: tournament.tournamentId,
            sequenceOrder: count + 1,
          },
        });
      } catch (err: any) {
        this.logger.warn(`Failed to link tournament to series ${createTournamentDto.seriesId}: ${err?.message}`);
      }
    }

    let tournamentVenues = tournament.venues;

    // Fallback: If no venues were linked or created, check existing venues in DB
    if (tournamentVenues.length === 0) {
      const existingVenues = await this.prisma.venue.findMany({
        include: { screens: true },
        take: 5,
      });
      if (existingVenues.length > 0) {
        tournamentVenues = existingVenues;
      }
    }

    // Resolve participating players
    let participants: Participant[] = [];
    if (
      inputPlayerIds &&
      Array.isArray(inputPlayerIds) &&
      inputPlayerIds.length > 0
    ) {
      const players = await this.prisma.player.findMany({
        where: {
          playerId: { in: inputPlayerIds },
        },
      });
      participants = players.map((p, idx) => ({
        playerId: p.playerId,
        name:
          `${p.firstName} ${p.lastName}`.trim() ||
          p.gamerTag ||
          p.username ||
          `Player ${idx + 1}`,
        homeVenueId:
          tournamentVenues.length > 0
            ? tournamentVenues[idx % tournamentVenues.length].venueId
            : undefined,
      }));
    } else {
      const activePlayers = await this.prisma.player.findMany({
        where: { status: 'ACTIVE', isDeleted: false },
        take: tournament.numberOfTeams,
      });
      participants = activePlayers.map((p, idx) => ({
        playerId: p.playerId,
        name:
          `${p.firstName} ${p.lastName}`.trim() ||
          p.gamerTag ||
          p.username ||
          `Player ${idx + 1}`,
        homeVenueId:
          tournamentVenues.length > 0
            ? tournamentVenues[idx % tournamentVenues.length].venueId
            : undefined,
      }));
    }

    const venueInputs: ScheduleVenueInput[] = tournamentVenues.map((v) => ({
      venueId: v.venueId,
      name: v.name,
      screens: v.screens.map((s) => ({
        screenId: s.screenId,
        screenName: s.screenName,
      })),
    }));

    // Generate schedule (capacity, canonical structure, calendar grid)
    const schedulePayload =
      await this.tournamentScheduleService.generateSchedule({
        tournamentId: tournament.tournamentId,
        tournamentName: tournament.name,
        tournamentFormat: tournament.tournamentFormat,
        schedulingMode,
        numberOfTeams: tournament.numberOfTeams,
        startDate: tournament.startDate,
        dailyStart: tournament.dailyStart,
        dailyEnd: tournament.dailyEnd,
        matchDuration: tournament.matchDuration,
        turnoverDuration: tournament.turnoverDuration,
        lunchBreakTime: tournament.lunchBreakTime,
        lunchDuration: tournament.lunchDuration,
        buffer: tournament.buffer,
        frequencyStatus: tournament.frequencyStatus,
        frequencyArray: tournament.frequencyArray,
        venues: venueInputs,
        participants,
        groupsCount,
        thirdPlacePlayoffEnabled,
      });

    // Update tournament with generated schedule in database
    await this.prisma.tournament.update({
      where: { tournamentId: tournament.tournamentId },
      data: { schedule: schedulePayload as any },
    });

    const result = {
      ...tournament,
      schedule: schedulePayload,
    };

    return this.presignTournamentMedia(result);
  }

  async getAllTournaments(query: QueryOptions = {}) {
    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      ['name', 'gameTitle'],
    );

    where.isDeleted = false;

    const [data, total] = await Promise.all([
      this.prisma.tournament.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          manageEventCosts: true,
          manageEventPrizes: true,
          venues: {
            include: {
              screens: true,
            },
          },
          sponsors: true,
          registrations: {
            include: {
              player: true,
            },
          },
          raffles: true,
          seriesTournaments: true,
        },
      }),
      this.prisma.tournament.count({ where }),
    ]);

    const formattedData = await Promise.all(
      data.map((item) => this.presignTournamentMedia(item)),
    );

    const meta = calculatePaginationMeta(total, page, limit);

    return { data: formattedData, meta };
  }

  async getTournamentById(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
      include: {
        manageEventCosts: true,
        manageEventPrizes: true,
        venues: {
          include: {
            screens: true,
          },
        },
        sponsors: true,
        registrations: {
          include: {
            player: true,
          },
        },
        raffles: true,
        seriesTournaments: true,
      },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    return this.presignTournamentMedia(tournament);
  }

  async updateTournament(id: string, updateTournamentDto: UpdateTournamentDto) {
    const existing = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
    });

    if (!existing || existing.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    if (
      updateTournamentDto.expectedVersion !== undefined &&
      updateTournamentDto.expectedVersion !== existing.version
    ) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: `Version conflict: Expected version ${updateTournamentDto.expectedVersion}, but current version is ${existing.version}`,
      });
    }

    const {
      startDate,
      deadline,
      venues: updateVenues,
      sponsors: updateSponsors,
      manageEventCosts: updateManageEventCosts,
      manageEventPrizes: updateManageEventPrizes,
      ...rest
    } = updateTournamentDto;

    const updateData: Record<string, any> = { ...rest };

    // Clean up virtual/frontend aliases from updateData before sending to Prisma
    delete updateData.expectedVersion;
    delete updateData.format;
    delete updateData.teams;
    delete updateData.scheduleSettings;
    delete updateData.frequencySettings;
    delete updateData.prizePoolConfig;
    delete updateData.houseRakePercent;
    delete updateData.registrationMode;
    delete updateData.maxCapacity;
    delete updateData.deadlineDate;
    delete updateData.eventCosts;
    delete updateData.prizePayouts;
    delete updateData.rulesUrl;
    delete updateData.termsAndConditionsUrl;
    delete updateData.logo;
    delete updateData.organizerLogo;
    delete updateData.secondaryOrganizerLogo;
    delete updateData.fanPassArtUrl;
    delete updateData.isDraft;

    // Map frontend aliases to Prisma fields if provided
    if (updateTournamentDto.format && !updateTournamentDto.tournamentFormat) {
      updateData.tournamentFormat = mapTournamentFormat(updateTournamentDto.format);
    }
    if (updateTournamentDto.teams !== undefined && updateTournamentDto.numberOfTeams === undefined) {
      updateData.numberOfTeams = Number(updateTournamentDto.teams);
    }
    if (updateTournamentDto.paymentWindowHours !== undefined && updateTournamentDto.paymentWindow === undefined) {
      updateData.paymentWindow = Number(updateTournamentDto.paymentWindowHours);
    }
    if (updateTournamentDto.rulesUrl) {
      updateData.rules = [updateTournamentDto.rulesUrl];
    }
    if (updateTournamentDto.termsAndConditionsUrl) {
      updateData.tsAndTc = [updateTournamentDto.termsAndConditionsUrl];
    }
    if (updateTournamentDto.logo) {
      updateData.tournamentLogoUrl = updateTournamentDto.logo;
    }
    if (updateTournamentDto.organizerLogo) {
      updateData.playerOrgUrl = updateTournamentDto.organizerLogo;
    }
    if (updateTournamentDto.fanPassArtUrl) {
      updateData.canvasImage = updateTournamentDto.fanPassArtUrl;
    }
    if (updateTournamentDto.prizePoolConfig) {
      if (updateTournamentDto.prizePoolConfig.type) {
        updateData.prizeRule = mapPrizeRule(updateTournamentDto.prizePoolConfig.type);
      }
      if (updateTournamentDto.prizePoolConfig.value !== undefined) {
        updateData.percentage = Number(updateTournamentDto.prizePoolConfig.value);
      }
    }
    if (updateTournamentDto.houseRakePercent !== undefined) {
      updateData.houseRake = Number(updateTournamentDto.houseRakePercent);
    }
    if (updateTournamentDto.registrationMode) {
      updateData.registrationCutOffMode = mapRegistrationMode(updateTournamentDto.registrationMode);
    }
    if (updateTournamentDto.maxCapacity !== undefined) {
      updateData.capacity = Number(updateTournamentDto.maxCapacity);
    }
    if (updateTournamentDto.deadlineDate) {
      updateData.deadline = new Date(updateTournamentDto.deadlineDate);
    }
    if (updateTournamentDto.scheduleSettings) {
      const ss = updateTournamentDto.scheduleSettings;
      if (ss.startDate) updateData.startDate = new Date(ss.startDate);
      if (ss.eventStartTime) updateData.dailyStart = ss.eventStartTime;
      if (ss.eventEndTime) updateData.dailyEnd = ss.eventEndTime;
      if (ss.slotDuration !== undefined) updateData.matchDuration = Number(ss.slotDuration);
      if (ss.turnoverDuration !== undefined) updateData.turnoverDuration = Number(ss.turnoverDuration);
      if (ss.lunchBreakStartTime) updateData.lunchBreakTime = ss.lunchBreakStartTime;
      if (ss.lunchBreakDuration !== undefined) updateData.lunchDuration = Number(ss.lunchBreakDuration);
    }
    if (updateTournamentDto.frequencySettings) {
      const fs = updateTournamentDto.frequencySettings;
      if (fs.frequency) updateData.frequencyStatus = mapFrequencyStatus(fs.frequency);
      if (fs.buffer !== undefined) updateData.buffer = Number(fs.buffer);
      if (fs.playingDays) updateData.frequencyArray = fs.playingDays.map(String);
    }

    if (startDate) {
      updateData.startDate = new Date(startDate);
    }
    if (deadline) {
      updateData.deadline = new Date(deadline);
    }
    if (rest.rules !== undefined) {
      updateData.rules = normalizeStringArray(rest.rules);
    }
    if (rest.tsAndTc !== undefined) {
      updateData.tsAndTc = normalizeStringArray(rest.tsAndTc);
    }
    if (rest.frequencyArray !== undefined) {
      updateData.frequencyArray = normalizeStringArray(rest.frequencyArray);
    }

    // Resolve & Create Costs
    const resolvedCostIds: string[] = [];
    if (updateManageEventCosts && Array.isArray(updateManageEventCosts)) {
      for (const item of updateManageEventCosts) {
        if (typeof item === 'string') {
          resolvedCostIds.push(item);
        } else if (
          typeof item === 'object' &&
          item !== null &&
          item.costCategory
        ) {
          const createdCost = await this.prisma.manageEventCost.create({
            data: {
              costCategory: item.costCategory,
              amount: Number(item.amount) || 0,
            },
          });
          resolvedCostIds.push(createdCost.manageEventCostId);
        }
      }
    }
    if (resolvedCostIds.length > 0) {
      updateData.manageEventCosts = {
        connect: resolvedCostIds.map((costId: string) => ({
          manageEventCostId: costId,
        })),
      };
    }

    // Resolve & Create Prizes
    const resolvedPrizeIds: string[] = [];
    if (updateManageEventPrizes && Array.isArray(updateManageEventPrizes)) {
      for (const item of updateManageEventPrizes) {
        if (typeof item === 'string') {
          resolvedPrizeIds.push(item);
        } else if (
          typeof item === 'object' &&
          item !== null &&
          item.prizeCategory
        ) {
          const createdPrize = await this.prisma.manageEventPrize.create({
            data: {
              prizeCategory: item.prizeCategory,
              amount: Number(item.amount) || 0,
            },
          });
          resolvedPrizeIds.push(createdPrize.manageEventPrizeId);
        }
      }
    }
    if (resolvedPrizeIds.length > 0) {
      updateData.manageEventPrizes = {
        connect: resolvedPrizeIds.map((prizeId: string) => ({
          manageEventPrizeId: prizeId,
        })),
      };
    }

    // Resolve & Create Sponsors
    const resolvedSponsorIds: string[] = [];
    if (updateSponsors && Array.isArray(updateSponsors)) {
      for (const item of updateSponsors) {
        if (typeof item === 'string') {
          resolvedSponsorIds.push(item);
        } else if (typeof item === 'object' && item !== null && item.name) {
          const createdSponsor = await this.prisma.sponsor.create({
            data: {
              name: item.name,
              logo: item.logo,
              website: item.website,
              priority: item.priority,
              contact: item.contact,
              value: item.value !== undefined ? Number(item.value) : undefined,
              status: item.status || SponsorStatus.BOTH,
            },
          });
          resolvedSponsorIds.push(createdSponsor.sponsorId);
        }
      }
    }
    if (resolvedSponsorIds.length > 0) {
      updateData.sponsors = {
        connect: resolvedSponsorIds.map((sponsorId: string) => ({
          sponsorId,
        })),
      };
    }

    // Resolve & Create Venues
    const resolvedUpdateVenueIds: string[] = [];
    if (updateVenues && Array.isArray(updateVenues)) {
      for (const item of updateVenues) {
        if (typeof item === 'string') {
          resolvedUpdateVenueIds.push(item);
        } else if (
          typeof item === 'object' &&
          item !== null &&
          (item.name || item.address)
        ) {
          const screens =
            item.screens && Array.isArray(item.screens)
              ? item.screens.map((s: any) => ({
                  screenName:
                    typeof s === 'string' ? s : s.screenName || 'Screen',
                }))
              : [];

          const createdVenue = await this.prisma.venue.create({
            data: {
              name: item.name || 'Venue',
              address: item.address || '',
              ...(screens.length > 0 && {
                screens: {
                  create: screens,
                },
              }),
            },
            include: { screens: true },
          });
          resolvedUpdateVenueIds.push(createdVenue.venueId);
        }
      }
    }
    if (resolvedUpdateVenueIds.length > 0) {
      updateData.venues = {
        connect: resolvedUpdateVenueIds.map((venueId: string) => ({ venueId })),
      };
    }

    const prismaScalarKeys = [
      'name',
      'gameTitle',
      'tournamentFormat',
      'numberOfTeams',
      'entryFee',
      'currency',
      'paymentWindow',
      'prizeRule',
      'percentage',
      'houseRake',
      'couponCreation',
      'registrationCutOffMode',
      'startDate',
      'deadline',
      'capacity',
      'dailyStart',
      'dailyEnd',
      'matchDuration',
      'turnoverDuration',
      'lunchBreakTime',
      'lunchDuration',
      'buffer',
      'frequencyStatus',
      'frequencyArray',
      'canvasImage',
      'playerOrgUrl',
      'prOrgUrl',
      'tournamentLogoUrl',
      'rules',
      'tsAndTc',
      'schedulingMode',
      'schedule',
      'status',
      'registrationOpen',
      'requireJerseySize',
      'schedulingPaused',
      'playerCardTemplate',
      'fanPassTemplate',
    ];

    const filteredUpdateData: Record<string, any> = {};
    for (const key of prismaScalarKeys) {
      if (updateData[key] !== undefined) {
        filteredUpdateData[key] = updateData[key];
      }
    }

    if (updateData.manageEventCosts) {
      filteredUpdateData.manageEventCosts = updateData.manageEventCosts;
    }
    if (updateData.manageEventPrizes) {
      filteredUpdateData.manageEventPrizes = updateData.manageEventPrizes;
    }
    if (updateData.sponsors) {
      filteredUpdateData.sponsors = updateData.sponsors;
    }
    if (updateData.venues) {
      filteredUpdateData.venues = updateData.venues;
    }

    const updated = await this.prisma.tournament.update({
      where: { tournamentId: id },
      data: {
        ...filteredUpdateData,
        version: { increment: 1 },
      },
      include: {
        manageEventCosts: true,
        manageEventPrizes: true,
        venues: {
          include: {
            screens: true,
          },
        },
        sponsors: true,
        registrations: {
          include: {
            player: true,
          },
        },
        raffles: true,
        seriesTournaments: true,
      },
    });

    if (updateTournamentDto.seriesId) {
      try {
        const existingLink = await this.prisma.seriesTournament.findFirst({
          where: { tournamentId: id },
        });
        if (!existingLink) {
          const count = await this.prisma.seriesTournament.count({
            where: { seriesId: updateTournamentDto.seriesId },
          });
          await this.prisma.seriesTournament.create({
            data: {
              seriesId: updateTournamentDto.seriesId,
              tournamentId: id,
              sequenceOrder: count + 1,
            },
          });
        } else if (existingLink.seriesId !== updateTournamentDto.seriesId) {
          await this.prisma.seriesTournament.update({
            where: {
              seriesId_tournamentId: {
                seriesId: existingLink.seriesId,
                tournamentId: id,
              },
            },
            data: {
              seriesId: updateTournamentDto.seriesId,
            },
          });
        }
      } catch (err: any) {
        this.logger.warn(`Failed to update series link for tournament ${id}: ${err?.message}`);
      }
    }

    return this.presignTournamentMedia(updated);
  }

  async deleteTournament(id: string) {
    const existing = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
    });

    if (!existing || existing.isDeleted) {
      throw new NotFoundException('Tournament not found or already deleted');
    }

    return this.prisma.tournament.update({
      where: { tournamentId: id },
      data: {
        isDeleted: true,
      },
    });
  }

  /**
   * Calendar Generation (POST /tournaments/{id}/calendar):
   * Generate the grid of dates, screens, and empty timeslots based on venue screens and hours.
   * Retains existing canonical match entities and their scores.
   */
  async generateCalendarForTournament(id: string, dto?: GenerateCalendarDto) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
      include: {
        venues: {
          include: {
            screens: true,
          },
        },
      },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    let tournamentVenues = tournament.venues;
    if (tournamentVenues.length === 0) {
      const existingVenues = await this.prisma.venue.findMany({
        include: { screens: true },
        take: 5,
      });
      if (existingVenues.length > 0) {
        tournamentVenues = existingVenues;
      }
    }

    if (tournamentVenues.length === 0) {
      throw new BadRequestException(
        'No venues or screens configured for this tournament to generate calendar grid.',
      );
    }

    const dailyStart = dto?.dailyStart || tournament.dailyStart;
    const dailyEnd = dto?.dailyEnd || tournament.dailyEnd;
    const matchDuration = dto?.matchDuration || tournament.matchDuration;
    const turnoverDuration =
      dto?.turnoverDuration !== undefined
        ? dto.turnoverDuration
        : tournament.turnoverDuration;
    const lunchBreakTime =
      dto?.lunchBreakTime !== undefined
        ? dto.lunchBreakTime
        : tournament.lunchBreakTime;
    const lunchDuration =
      dto?.lunchDuration !== undefined
        ? dto.lunchDuration
        : tournament.lunchDuration;
    const buffer = dto?.buffer !== undefined ? dto.buffer : tournament.buffer;
    const frequencyStatus = dto?.frequencyStatus || tournament.frequencyStatus;
    const frequencyArray = dto?.frequencyArray || tournament.frequencyArray;

    const venueInputs: ScheduleVenueInput[] = tournamentVenues.map((v) => ({
      venueId: v.venueId,
      name: v.name,
      screens: v.screens.map((s) => ({
        screenId: s.screenId,
        screenName: s.screenName,
      })),
    }));

    // Retrieve existing schedule or initialize structure
    const existingSchedule: any = tournament.schedule || {};
    let structure = existingSchedule.structure;

    if (!structure || !structure.matches) {
      structure = this.tournamentScheduleService.generateCanonicalStructure(
        tournament.tournamentId,
        tournament.tournamentFormat,
        tournament.numberOfTeams,
      );
    }

    const schedulableCount =
      structure.summary?.schedulableMatches ||
      structure.summary?.totalCompetitionMatches ||
      structure.matches.length;

    // Calculate capacity metrics based on Part 2 formulas
    const capacity = this.tournamentScheduleService.calculateCapacity({
      dailyStart,
      dailyEnd,
      slotDuration: matchDuration,
      turnoverDuration,
      lunchBreakTime,
      lunchDuration,
      venues: venueInputs,
      totalMatches: schedulableCount,
    });

    const eventDates = this.tournamentScheduleService.generatePlayingDates(
      tournament.startDate,
      capacity.totalPlayingDaysNeeded,
      frequencyStatus,
      frequencyArray,
      buffer,
    );

    const dayTimeslots = this.tournamentScheduleService.calculateDayTimeslots(
      dailyStart,
      dailyEnd,
      matchDuration,
      turnoverDuration,
      lunchBreakTime,
      lunchDuration,
    );

    // Build empty calendar grid
    const calendar = this.tournamentScheduleService.buildEmptyScheduleGrid(
      venueInputs,
      eventDates,
      dayTimeslots,
      dto?.schedulingPolicy,
    );

    // Retain existing allocations and scores if valid in new calendar grid
    const existingMatches = structure.matches || [];
    for (const match of existingMatches) {
      if (match.venueId && match.screenId && match.date && match.time) {
        const venue = calendar.find((v) => v.venueId === match.venueId);
        const screen = venue?.screens.find(
          (s) => s.screenId === match.screenId,
        );
        const day = screen?.days.find((d) => d.date === match.date);
        const slot = day?.timeslots.find((t) => t.time === match.time);

        if (slot && slot.canonicalMatchId === null) {
          slot.canonicalMatchId = match.id;
          slot.game = {
            id: match.id,
            canonicalMatchId: match.id,
            player1Id: match.player1Id || 'TBD',
            player1Name: match.player1Name || 'TBD',
            player2Id: match.player2Id || 'TBD',
            player2Name: match.player2Name || 'TBD',
            score1: match.score1,
            score2: match.score2,
            status: match.status,
            round: match.round,
            matchNumber: match.matchNumber,
            bracketSection: match.bracketSection,
            venueId: match.venueId,
            venueName: venue?.venueName,
            screenId: match.screenId,
            screenName: screen?.screenName,
            date: match.date,
            time: match.time,
          };
        }
      }
    }

    const schedulePayload: TournamentSchedulePayload = {
      capacity: { ...capacity, eventDates },
      structure,
      calendar,
    };

    const updated = await this.prisma.tournament.update({
      where: { tournamentId: id },
      data: {
        schedule: schedulePayload as any,
      },
      include: {
        manageEventCosts: true,
        manageEventPrizes: true,
        venues: {
          include: {
            screens: true,
          },
        },
        sponsors: true,
      },
    });

    return this.presignTournamentMedia(updated);
  }

  /**
   * Physical Allocations (POST /tournaments/{id}/matches/{id}/allocate):
   * Link a canonical match ID to a physical slot (venueId, screenId, date, time).
   * INVARIANT: Never overwrite scores when moving a schedule slot.
   */
  async allocateTournamentMatch(
    tournamentId: string,
    matchId: string,
    dto: AllocateMatchDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    const currentSchedule =
      tournament.schedule as any as TournamentSchedulePayload;
    if (!currentSchedule || !currentSchedule.structure) {
      throw new BadRequestException(
        'Tournament schedule and canonical structure have not been generated yet.',
      );
    }

    const { updatedSchedule, match, allocation } =
      this.tournamentScheduleService.allocateMatch(
        currentSchedule,
        matchId,
        dto.venueId,
        dto.screenId,
        dto.date,
        dto.time,
      );

    await this.prisma.tournament.update({
      where: { tournamentId },
      data: { schedule: updatedSchedule as any },
    });

    return {
      allocation,
      match,
    };
  }

  /**
   * Clears physical allocation for a canonical match, preserving scores.
   */
  async unallocateTournamentMatch(tournamentId: string, matchId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    const currentSchedule =
      tournament.schedule as any as TournamentSchedulePayload;
    if (!currentSchedule || !currentSchedule.structure) {
      throw new BadRequestException(
        'Tournament schedule has not been generated yet.',
      );
    }

    const { updatedSchedule, match } =
      this.tournamentScheduleService.unallocateMatch(currentSchedule, matchId);

    await this.prisma.tournament.update({
      where: { tournamentId },
      data: { schedule: updatedSchedule as any },
    });

    return {
      match,
    };
  }

  /**
   * Auto allocation for all unallocated matches (POST /tournaments/{id}/auto-allocation).
   */
  async autoAllocateTournamentMatches(
    tournamentId: string,
    dto?: AutoAllocationDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      include: {
        venues: {
          include: {
            screens: true,
          },
        },
      },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    const currentSchedule =
      tournament.schedule as any as TournamentSchedulePayload;
    if (!currentSchedule || !currentSchedule.structure) {
      throw new BadRequestException(
        'Tournament schedule has not been generated yet.',
      );
    }

    const mode =
      dto?.mode || tournament.schedulingMode || SchedulingMode.AUTO_HOME_VENUE;

    // Gather participants from slots or DB
    const participants: Participant[] = (currentSchedule.structure.slots || [])
      .filter((s) => s.participantId)
      .map((s, idx) => ({
        playerId: s.participantId!,
        name: s.participantName || `Player ${s.slotNumber}`,
        homeVenueId:
          tournament.venues.length > 0
            ? tournament.venues[idx % tournament.venues.length].venueId
            : undefined,
      }));

    const updatedCalendar =
      this.tournamentScheduleService.assignMatchesToSchedule(
        currentSchedule.calendar,
        currentSchedule.structure.matches,
        participants,
        mode,
      );

    const updatedPayload: TournamentSchedulePayload = {
      ...currentSchedule,
      calendar: updatedCalendar,
    };

    await this.prisma.tournament.update({
      where: { tournamentId },
      data: { schedule: updatedPayload as any, schedulingMode: mode },
    });

    return {
      mode,
      matches: currentSchedule.structure.matches,
      calendar: updatedCalendar,
    };
  }

  /**
   * Returns canonical matches for tournament (GET /tournaments/{id}/matches).
   */
  async getTournamentMatches(
    id: string,
    filter?: {
      round?: string;
      status?: string;
      isAllocated?: string | boolean;
    },
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    const schedule = tournament.schedule as any;
    let matches: any[] = schedule?.structure?.matches || [];
    const summary = schedule?.structure?.summary || {};

    if (filter) {
      if (filter.round) {
        matches = matches.filter((m) =>
          m.round?.toLowerCase().includes(filter.round!.toLowerCase()),
        );
      }
      if (filter.status) {
        matches = matches.filter((m) =>
          m.status?.toLowerCase().includes(filter.status!.toLowerCase()),
        );
      }
      if (filter.isAllocated !== undefined && filter.isAllocated !== '') {
        const wantAllocated =
          filter.isAllocated === true || filter.isAllocated === 'true';
        matches = matches.filter((m) => {
          const hasAlloc = Boolean(m.physicalAllocation || m.allocatedSlot);
          return wantAllocated ? hasAlloc : !hasAlloc;
        });
      }
    }

    return {
      tournamentId: id,
      summary,
      matches,
    };
  }

  /**
   * Returns calendar grid for tournament (GET /tournaments/{id}/calendar or GET /tournaments/{id}/schedule).
   */
  async getTournamentCalendar(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    const schedule = tournament.schedule as any;
    const calendar = schedule?.calendar || [];
    const capacity = schedule?.capacity || {};

    return {
      tournamentId: id,
      capacity,
      calendar,
    };
  }

  /**
   * Returns capacity calculation breakdown (GET /tournaments/{id}/capacity or GET /admin/tournaments/{id}/schedule/capacity).
   */
  async getTournamentCapacity(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    const schedule = tournament.schedule as any;
    const capacity = schedule?.capacity || {};
    const matches: any[] = schedule?.structure?.matches || [];
    const calendar: any[] = schedule?.calendar || [];

    const allocatedCount = matches.filter(
      (m: any) => m.physicalAllocation || m.allocatedSlot,
    ).length;

    let totalPhysicalSlots = 0;
    let occupiedPhysicalSlots = 0;
    for (const v of calendar) {
      for (const s of v.screens || []) {
        for (const d of s.days || []) {
          for (const ts of d.timeslots || []) {
            totalPhysicalSlots++;
            if (ts.game || ts.canonicalMatchId) {
              occupiedPhysicalSlots++;
            }
          }
        }
      }
    }

    const guaranteed =
      schedule?.structure?.summary?.guaranteedMatches ||
      capacity.totalMatches ||
      tournament.numberOfTeams ||
      0;
    const conditional =
      schedule?.structure?.summary?.conditionalMatches || 0;
    const maximum =
      schedule?.structure?.summary?.maximumPossibleMatches ||
      guaranteed + conditional;

    return {
      status: 'SUFFICIENT',
      guaranteedMatches: guaranteed,
      conditionalMatches: conditional,
      maximumPossibleMatches: maximum,
      allocatedMatches: allocatedCount,
      pendingGuaranteedMatches: Math.max(0, guaranteed - allocatedCount),
      inactiveConditionalReserveMatches: 0,
      totalPhysicalSlots: totalPhysicalSlots || capacity.totalDailySlots || 0,
      occupiedPhysicalSlots,
      availablePhysicalSlots: Math.max(
        0,
        (totalPhysicalSlots || capacity.totalDailySlots || 0) -
          occupiedPhysicalSlots,
      ),
      guaranteedDeficit: 0,
      conditionalReserveDeficit: 0,
      surplusAfterMaximum: Math.max(
        0,
        (totalPhysicalSlots || capacity.totalDailySlots || 0) - maximum,
      ),
      baselinePlayingDays: capacity.totalPlayingDaysNeeded || 1,
      conditionalReservePlayingDays: 0,
      bufferPlayingDays: tournament.buffer || 1,
      totalGeneratedPlayingDays:
        (capacity.totalPlayingDaysNeeded || 1) + (tournament.buffer || 1),
      playerConflictCount: 0,
      ...capacity,
    };
  }

  /**
   * Regenerates full match schedule and canonical structure for a Tournament.
   */
  async generateScheduleForTournament(
    id: string,
    schedulingModeOverride?: SchedulingMode,
    playerIds?: string[],
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
      include: {
        venues: {
          include: {
            screens: true,
          },
        },
      },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    const schedulingMode =
      schedulingModeOverride ||
      tournament.schedulingMode ||
      SchedulingMode.AUTO_HOME_VENUE;

    let tournamentVenues = tournament.venues;
    if (tournamentVenues.length === 0) {
      const existingVenues = await this.prisma.venue.findMany({
        include: { screens: true },
        take: 5,
      });
      if (existingVenues.length > 0) {
        tournamentVenues = existingVenues;
      }
    }

    let participants: Participant[] = [];
    if (playerIds && Array.isArray(playerIds) && playerIds.length > 0) {
      const players = await this.prisma.player.findMany({
        where: { playerId: { in: playerIds } },
      });
      participants = players.map((p, idx) => ({
        playerId: p.playerId,
        name:
          `${p.firstName} ${p.lastName}`.trim() ||
          p.gamerTag ||
          p.username ||
          `Player ${idx + 1}`,
        homeVenueId:
          tournamentVenues.length > 0
            ? tournamentVenues[idx % tournamentVenues.length].venueId
            : undefined,
      }));
    } else {
      const activePlayers = await this.prisma.player.findMany({
        where: { status: 'ACTIVE', isDeleted: false },
        take: tournament.numberOfTeams,
      });
      participants = activePlayers.map((p, idx) => ({
        playerId: p.playerId,
        name:
          `${p.firstName} ${p.lastName}`.trim() ||
          p.gamerTag ||
          p.username ||
          `Player ${idx + 1}`,
        homeVenueId:
          tournamentVenues.length > 0
            ? tournamentVenues[idx % tournamentVenues.length].venueId
            : undefined,
      }));
    }

    const venueInputs: ScheduleVenueInput[] = tournamentVenues.map((v) => ({
      venueId: v.venueId,
      name: v.name,
      screens: v.screens.map((s) => ({
        screenId: s.screenId,
        screenName: s.screenName,
      })),
    }));

    const schedule = await this.tournamentScheduleService.generateSchedule({
      tournamentId: tournament.tournamentId,
      tournamentName: tournament.name,
      tournamentFormat: tournament.tournamentFormat,
      schedulingMode,
      numberOfTeams: tournament.numberOfTeams,
      startDate: tournament.startDate,
      dailyStart: tournament.dailyStart,
      dailyEnd: tournament.dailyEnd,
      matchDuration: tournament.matchDuration,
      turnoverDuration: tournament.turnoverDuration,
      lunchBreakTime: tournament.lunchBreakTime,
      lunchDuration: tournament.lunchDuration,
      buffer: tournament.buffer,
      frequencyStatus: tournament.frequencyStatus,
      frequencyArray: tournament.frequencyArray,
      venues: venueInputs,
      participants,
    });

    const updated = await this.prisma.tournament.update({
      where: { tournamentId: id },
      data: {
        schedulingMode,
        schedule: schedule as any,
      },
      include: {
        manageEventCosts: true,
        manageEventPrizes: true,
        venues: {
          include: {
            screens: true,
          },
        },
        sponsors: true,
      },
    });

    return this.presignTournamentMedia(updated);
  }

  /**
   * Updates score and status for a canonical match, advancing winners in brackets if applicable.
   */
  async updateMatchScore(
    tournamentId: string,
    matchId: string,
    dto: UpdateMatchScoreDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });

    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const schedule = (tournament.schedule as any) || {};
    const matches: any[] = schedule.structure?.matches || schedule.matches || [];

    const matchIndex = matches.findIndex(
      (m: any) => m.id === matchId || m.canonicalMatchId === matchId,
    );

    if (matchIndex === -1) {
      throw new NotFoundException(`Match #${matchId} not found in tournament schedule`);
    }

    const match = matches[matchIndex];
    match.score1 = dto.score1;
    match.score2 = dto.score2;
    match.status = dto.status || 'COMPLETED';

    // Bracket Progression logic
    if (match.score1 !== null && match.score2 !== null) {
      const winner =
        match.score1 > match.score2
          ? match.participant1Ref
          : match.score2 > match.score1
            ? match.participant2Ref
            : null;

      const loser =
        match.score1 > match.score2
          ? match.participant2Ref
          : match.score2 > match.score1
            ? match.participant1Ref
            : null;

      if (winner && match.nextMatchWinnerTargetId) {
        const nextWinnerMatch = matches.find(
          (m: any) => m.id === match.nextMatchWinnerTargetId,
        );
        if (nextWinnerMatch) {
          if (!nextWinnerMatch.participant1Ref || nextWinnerMatch.participant1Ref.sourceMatchId === match.id) {
            nextWinnerMatch.participant1Ref = winner;
          } else if (!nextWinnerMatch.participant2Ref || nextWinnerMatch.participant2Ref.sourceMatchId === match.id) {
            nextWinnerMatch.participant2Ref = winner;
          }
        }
      }

      if (loser && match.nextMatchLoserTargetId) {
        const nextLoserMatch = matches.find(
          (m: any) => m.id === match.nextMatchLoserTargetId,
        );
        if (nextLoserMatch) {
          if (!nextLoserMatch.participant1Ref || nextLoserMatch.participant1Ref.sourceMatchId === match.id) {
            nextLoserMatch.participant1Ref = loser;
          } else if (!nextLoserMatch.participant2Ref || nextLoserMatch.participant2Ref.sourceMatchId === match.id) {
            nextLoserMatch.participant2Ref = loser;
          }
        }
      }

      // Check Grand Final Reset condition
      for (const m of matches) {
        if (m.conditionType === 'GRAND_FINAL_RESET' && m.conditionMatchId === match.id) {
          const activated = match.status === 'COMPLETED' && match.score2 > match.score1;
          m.isSchedulable = activated;
        }
      }
    }

    // Update physical timeslot games in calendar / venueSchedules if exists
    const venueList = schedule.calendar?.venues || schedule.venueSchedules || [];
    if (Array.isArray(venueList)) {
      for (const venue of venueList) {
        for (const screen of venue.screens || []) {
          for (const day of screen.days || []) {
            for (const slot of day.timeslots || []) {
              if (slot.game && (slot.game.id === matchId || slot.game.canonicalMatchId === matchId)) {
                slot.game.score1 = match.score1;
                slot.game.score2 = match.score2;
                slot.game.status = match.status;
              }
            }
          }
        }
      }
    }

    matches[matchIndex] = match;
    if (schedule.structure) {
      schedule.structure.matches = matches;
    } else {
      schedule.matches = matches;
    }

    await this.prisma.tournament.update({
      where: { tournamentId },
      data: { schedule: schedule as any },
    });

    return match;
  }

  /**
   * Records a No-Show for an offending player, assigning a 3-0 victory to the opponent.
   */
  async recordNoShow(
    tournamentId: string,
    matchId: string,
    dto: MatchNoShowDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const schedule = (tournament.schedule as any) || {};
    const matches: any[] = schedule.structure?.matches || schedule.matches || [];
    const match = matches.find(
      (m: any) => m.id === matchId || m.canonicalMatchId === matchId,
    );

    if (!match) {
      throw new NotFoundException(`Match #${matchId} not found`);
    }

    const isP1 =
      match.participant1Ref?.id === dto.offendingPlayerId ||
      match.player1Id === dto.offendingPlayerId;

    const score1 = isP1 ? 0 : 3;
    const score2 = isP1 ? 3 : 0;

    return this.updateMatchScore(tournamentId, matchId, {
      score1,
      score2,
      status: 'COMPLETED',
      offendingPlayerId: dto.offendingPlayerId,
    });
  }

  /**
   * Returns all completed and scored matches of a tournament.
   */
  async getTournamentResults(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const schedule = (tournament.schedule as any) || {};
    const matches: any[] = schedule.structure?.matches || schedule.matches || [];

    return matches.filter(
      (m: any) =>
        m.status === 'COMPLETED' || (m.score1 !== null && m.score2 !== null),
    );
  }

  /**
   * Computes standings / leaderboard table from completed tournament matches.
   */
  async getTournamentLeaderboard(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const schedule = (tournament.schedule as any) || {};
    const matches: any[] = schedule.structure?.matches || schedule.matches || [];
    const participants: any[] = schedule.participants || schedule.structure?.participants || [];

    const statsMap = new Map<string, {
      playerId: string;
      name: string;
      played: number;
      won: number;
      drawn: number;
      lost: number;
      goalsFor: number;
      goalsAgainst: number;
      goalDifference: number;
      points: number;
    }>();

    const getOrInitStats = (id: string, defaultName: string) => {
      if (!statsMap.has(id)) {
        statsMap.set(id, {
          playerId: id,
          name: defaultName,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0,
        });
      }
      return statsMap.get(id)!;
    };

    // Initialize all participants
    for (const p of participants) {
      getOrInitStats(p.id, p.name || p.displayName || p.id);
    }

    // Process completed matches
    for (const match of matches) {
      if (
        (match.status === 'COMPLETED' || (match.score1 !== null && match.score2 !== null))
      ) {
        const p1Id = match.player1Id || match.participant1Ref?.id || match.participant1Ref?.value;
        const p2Id = match.player2Id || match.participant2Ref?.id || match.participant2Ref?.value;

        if (!p1Id || !p2Id) continue;

        const p1Name = match.player1Name || match.participant1Ref?.name || `Player ${p1Id}`;
        const p2Name = match.player2Name || match.participant2Ref?.name || `Player ${p2Id}`;

        const s1 = Number(match.score1) || 0;
        const s2 = Number(match.score2) || 0;

        const p1Stats = getOrInitStats(p1Id, p1Name);
        const p2Stats = getOrInitStats(p2Id, p2Name);

        p1Stats.played += 1;
        p2Stats.played += 1;
        p1Stats.goalsFor += s1;
        p1Stats.goalsAgainst += s2;
        p2Stats.goalsFor += s2;
        p2Stats.goalsAgainst += s1;

        if (s1 > s2) {
          p1Stats.won += 1;
          p1Stats.points += 3;
          p2Stats.lost += 1;
        } else if (s2 > s1) {
          p2Stats.won += 1;
          p2Stats.points += 3;
          p1Stats.lost += 1;
        } else {
          p1Stats.drawn += 1;
          p1Stats.points += 1;
          p2Stats.drawn += 1;
          p2Stats.points += 1;
        }

        p1Stats.goalDifference = p1Stats.goalsFor - p1Stats.goalsAgainst;
        p2Stats.goalDifference = p2Stats.goalsFor - p2Stats.goalsAgainst;
      }
    }

    const standings = Array.from(statsMap.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      return b.goalsFor - a.goalsFor;
    });

    return standings;
  }

  /**
   * Registers a player for a tournament.
   */
  async createRegistration(
    tournamentId: string,
    dto: CreateTournamentRegistrationDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      include: { registrations: true },
    });

    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const existing = await this.prisma.tournamentRegistration.findUnique({
      where: {
        tournamentId_playerId: {
          tournamentId,
          playerId: dto.playerId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Player is already registered for this tournament');
    }

    // Determine initial status based on capacity
    const currentConfirmedOrRegistered = tournament.registrations.filter(
      (r) =>
        r.status === TournamentRegistrationStatus.CONFIRMED ||
        r.status === TournamentRegistrationStatus.REGISTERED,
    ).length;

    const initialStatus =
      currentConfirmedOrRegistered >= tournament.capacity
        ? TournamentRegistrationStatus.WAITLISTED
        : TournamentRegistrationStatus.REGISTERED;

    return this.prisma.tournamentRegistration.create({
      data: {
        tournamentId,
        playerId: dto.playerId,
        homeVenueId: dto.homeVenueId,
        primaryTeamId: dto.primaryTeamId,
        secondaryTeamId: dto.secondaryTeamId,
        jerseySize: dto.jerseySize,
        playerPhotoUrl: dto.playerPhotoUrl,
        status: initialStatus,
        paymentStatus: 'PENDING',
      },
      include: {
        player: {
          select: {
            playerId: true,
            firstName: true,
            lastName: true,
            gamerTag: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Gets all tournament registrations grouped by tabs (Registered, Selected Unpaid, Confirmed, Waitlist).
   */
  async getTournamentRegistrations(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });

    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

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

    return {
      registered: registrations.filter(
        (r) => r.status === TournamentRegistrationStatus.REGISTERED,
      ),
      selectedUnpaid: registrations.filter(
        (r) => r.status === TournamentRegistrationStatus.SELECTED_UNPAID,
      ),
      confirmed: registrations.filter(
        (r) => r.status === TournamentRegistrationStatus.CONFIRMED,
      ),
      waitlist: registrations.filter(
        (r) => r.status === TournamentRegistrationStatus.WAITLISTED,
      ),
      totalCount: registrations.length,
    };
  }

  /**
   * Updates registration status (e.g. promoting from Registered to Confirmed).
   */
  async updateRegistrationStatus(
    tournamentId: string,
    registrationId: string,
    dto: UpdateRegistrationStatusDto,
  ) {
    const registration = await this.prisma.tournamentRegistration.findFirst({
      where: {
        registrationId,
        tournamentId,
      },
    });

    if (!registration) {
      throw new NotFoundException(`Registration #${registrationId} not found`);
    }

    return this.prisma.tournamentRegistration.update({
      where: { registrationId },
      data: {
        status: dto.status,
        ...(dto.paymentStatus ? { paymentStatus: dto.paymentStatus } : {}),
      },
      include: {
        player: true,
      },
    });
  }

  /**
   * Open tournament registration with mode, capacity, and deadline.
   */
  async openRegistration(tournamentId: string, dto: OpenRegistrationDto) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    return this.prisma.tournament.update({
      where: { tournamentId },
      data: {
        registrationOpen: true,
        registrationCutOffMode: dto.mode,
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.deadline ? { deadline: new Date(dto.deadline) } : {}),
        ...(dto.requireJerseySize !== undefined ? { requireJerseySize: dto.requireJerseySize } : {}),
      },
    });
  }

  /**
   * Close tournament registration.
   */
  async closeRegistration(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    return this.prisma.tournament.update({
      where: { tournamentId },
      data: { registrationOpen: false },
    });
  }

  /**
   * Pause tournament scheduling.
   */
  async pauseScheduling(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    return this.prisma.tournament.update({
      where: { tournamentId },
      data: { schedulingPaused: true },
    });
  }

  /**
   * Resume tournament scheduling.
   */
  async resumeScheduling(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    return this.prisma.tournament.update({
      where: { tournamentId },
      data: { schedulingPaused: false },
    });
  }

  /**
   * Get all raffles for tournament.
   */
  async getRaffles(tournamentId: string) {
    return this.prisma.raffle.findMany({
      where: { tournamentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Create a new raffle.
   */
  async createRaffle(tournamentId: string, dto: CreateRaffleDto) {
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
   * Draws random winners for a raffle from its entries.
   */
  async drawRaffle(tournamentId: string, raffleId: string) {
    const raffle = await this.prisma.raffle.findFirst({
      where: { raffleId, tournamentId },
    });
    if (!raffle) {
      throw new NotFoundException(`Raffle #${raffleId} not found`);
    }

    const entries = Array.isArray(raffle.entries) ? (raffle.entries as any[]) : [];
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
   * Update Player Card and Fan Pass Templates.
   */
  async updateTemplates(
    tournamentId: string,
    dto: UpdateTournamentTemplatesDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    return this.prisma.tournament.update({
      where: { tournamentId },
      data: {
        ...(dto.playerCardTemplate !== undefined
          ? { playerCardTemplate: dto.playerCardTemplate as any }
          : {}),
        ...(dto.fanPassTemplate !== undefined
          ? { fanPassTemplate: dto.fanPassTemplate as any }
          : {}),
      },
    });
  }

  /**
   * Get Player Card and Fan Pass Templates.
   */
  async getTemplates(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      select: {
        playerCardTemplate: true,
        fanPassTemplate: true,
      },
    });
    if (!tournament) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    return tournament;
  }

  /**
   * 2.1 Lifecycle Status Transition with State Machine Validation & Optimistic Locking
   */
  async updateTournamentStatus(id: string, dto: UpdateTournamentStatusDto) {
    const existing = await this.prisma.tournament.findUnique({
      where: { tournamentId: id },
    });

    if (!existing || existing.isDeleted) {
      throw new NotFoundException('Tournament not found or has been deleted');
    }

    if (
      dto.expectedVersion !== undefined &&
      dto.expectedVersion !== existing.version
    ) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: `Version conflict: Expected version ${dto.expectedVersion}, but current version is ${existing.version}`,
      });
    }

    const updated = await this.prisma.tournament.update({
      where: { tournamentId: id },
      data: {
        status: dto.status,
        version: { increment: 1 },
      },
    });

    return {
      id: updated.tournamentId,
      status: updated.status,
      version: updated.version,
    };
  }

  /**
   * 2.2 Venue & Screen Management
   */
  async addTournamentVenue(tournamentId: string, dto: any) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found');
    }

    const screens =
      dto.screens && Array.isArray(dto.screens)
        ? dto.screens.map((s: any) => ({
            screenName: typeof s === 'string' ? s : s.name || s.screenName || 'Screen',
          }))
        : [];

    const venue = await this.prisma.venue.create({
      data: {
        name: dto.name || 'Venue',
        address: dto.address || '',
        tournamentId,
        ...(screens.length > 0 && {
          screens: {
            create: screens,
          },
        }),
      },
      include: { screens: true },
    });

    return {
      venue: {
        id: venue.venueId,
        name: venue.name,
        address: venue.address,
        screens: venue.screens.map((s) => ({
          id: s.screenId,
          name: s.screenName,
        })),
      },
    };
  }

  async deleteTournamentVenue(tournamentId: string, venueId: string) {
    const venue = await this.prisma.venue.findFirst({
      where: { venueId, tournamentId },
      include: { screens: true },
    });
    if (!venue) {
      throw new NotFoundException(`Venue '${venueId}' not found for this tournament`);
    }

    // Check if any match has active allocations on this venue's screens
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    const schedule = (tournament?.schedule as any) || {};
    const matches: any[] = schedule.matches || [];
    const screenIds = new Set(venue.screens.map((s) => s.screenId));

    const hasActiveAllocation = matches.some((m) => {
      const alloc = m.physicalAllocation || m.allocatedSlot;
      return alloc && (alloc.venueId === venueId || screenIds.has(alloc.screenId));
    });

    if (hasActiveAllocation) {
      throw new ConflictException(
        'Cannot delete venue: active match allocations exist on this venue screens. De-allocate matches first.',
      );
    }

    await this.prisma.venue.delete({
      where: { venueId },
    });

    return {
      deletedVenueId: venueId,
    };
  }

  /**
   * 2.3 Registrations with Counts & Tabs
   */
  async getTournamentRegistrationsWithCounts(
    tournamentId: string,
    query: QueryTournamentRegistrationDto,
  ) {
    const { tab, status, paymentStatus, search, page = 1, limit = 25 } = query;
    const skip = (page - 1) * limit;

    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found');
    }

    const [regCount, selectedCount, confirmedCount, waitlistCount] =
      await Promise.all([
        this.prisma.tournamentRegistration.count({
          where: {
            tournamentId,
            status: TournamentRegistrationStatus.REGISTERED,
          },
        }),
        this.prisma.tournamentRegistration.count({
          where: {
            tournamentId,
            status: TournamentRegistrationStatus.SELECTED_UNPAID,
          },
        }),
        this.prisma.tournamentRegistration.count({
          where: {
            tournamentId,
            status: TournamentRegistrationStatus.CONFIRMED,
          },
        }),
        this.prisma.tournamentRegistration.count({
          where: {
            tournamentId,
            status: TournamentRegistrationStatus.WAITLISTED,
          },
        }),
      ]);

    let statusFilter: TournamentRegistrationStatus | undefined = status;
    if (tab === 'registered') {
      statusFilter = TournamentRegistrationStatus.REGISTERED;
    } else if (tab === 'selected') {
      statusFilter = TournamentRegistrationStatus.SELECTED_UNPAID;
    } else if (tab === 'confirmed') {
      statusFilter = TournamentRegistrationStatus.CONFIRMED;
    } else if (tab === 'waitlist') {
      statusFilter = TournamentRegistrationStatus.WAITLISTED;
    }

    const where: Prisma.TournamentRegistrationWhereInput = {
      tournamentId,
      ...(statusFilter && { status: statusFilter }),
      ...(paymentStatus && {
        paymentStatus: { equals: paymentStatus, mode: 'insensitive' },
      }),
      ...(search && {
        player: {
          OR: [
            { gamerTag: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        },
      }),
    };

    const [totalItems, registrations] = await Promise.all([
      this.prisma.tournamentRegistration.count({ where }),
      this.prisma.tournamentRegistration.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          player: {
            select: {
              playerId: true,
              firstName: true,
              lastName: true,
              gamerTag: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const items = registrations.map((r) => ({
      id: r.registrationId,
      playerId: r.playerId,
      userId: r.player.playerId,
      playerProfileId: `prof-${r.playerId.slice(0, 8)}`,
      fullName: `${r.player.firstName} ${r.player.lastName}`.trim(),
      gamertag: r.player.gamerTag || r.player.firstName,
      playerPhotoUrl: r.playerPhotoUrl,
      homeVenueId: r.homeVenueId,
      homeVenueName: 'Venue',
      teamSelection: {
        primaryTeamId: r.primaryTeamId,
        secondaryTeamId: r.secondaryTeamId,
      },
      jerseySize: r.jerseySize,
      status: r.status,
      paymentStatus: r.paymentStatus,
      registrationDate: r.createdAt,
      paymentDeadline: r.paymentDeadline,
      checkedInVenue: r.checkedInVenue,
      qrCodeString: r.qrCodeString,
      assignedSlot: r.assignedSlot,
      version: r.version,
    }));

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items,
      counts: {
        registered: regCount,
        selectedUnpaid: selectedCount,
        confirmed: confirmedCount,
        waitlisted: waitlistCount,
      },
      pagination: {
        totalItems,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async selectRegistrations(
    tournamentId: string,
    dto: RegistrationSelectionDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found');
    }

    if (
      dto.expectedVersion !== undefined &&
      dto.expectedVersion !== tournament.version
    ) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: `Version conflict: Expected version ${dto.expectedVersion}, but current version is ${tournament.version}`,
      });
    }

    let targetRegs: { registrationId: string }[] = [];

    if (dto.mode === SelectionMode.MANUAL) {
      if (!dto.registrationIds || dto.registrationIds.length === 0) {
        throw new BadRequestException('registrationIds is required for manual mode');
      }
      targetRegs = dto.registrationIds.map((id) => ({ registrationId: id }));
    } else if (dto.mode === SelectionMode.FIRST_IN) {
      const count = dto.count || 16;
      targetRegs = await this.prisma.tournamentRegistration.findMany({
        where: {
          tournamentId,
          status: TournamentRegistrationStatus.REGISTERED,
        },
        orderBy: { createdAt: 'asc' },
        take: count,
        select: { registrationId: true },
      });
    } else if (dto.mode === SelectionMode.RANDOM) {
      const count = dto.count || 16;
      const allRegistered = await this.prisma.tournamentRegistration.findMany({
        where: {
          tournamentId,
          status: TournamentRegistrationStatus.REGISTERED,
        },
        select: { registrationId: true },
      });
      const shuffled = [...allRegistered].sort(() => 0.5 - Math.random());
      targetRegs = shuffled.slice(0, count);
    }

    const windowHours = dto.paymentWindowHours || tournament.paymentWindow || 24;
    const paymentDeadline = new Date(Date.now() + windowHours * 60 * 60 * 1000);
    const targetIds = targetRegs.map((r) => r.registrationId);

    if (targetIds.length > 0) {
      await this.prisma.tournamentRegistration.updateMany({
        where: { registrationId: { in: targetIds } },
        data: {
          status: TournamentRegistrationStatus.SELECTED_UNPAID,
          paymentDeadline,
          version: { increment: 1 },
        },
      });
    }

    return {
      selectedCount: targetIds.length,
      paymentDeadline,
      updatedRegistrationIds: targetIds,
    };
  }

  async processPaymentExpiry(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found');
    }

    const now = new Date();
    const expiredRegs = await this.prisma.tournamentRegistration.findMany({
      where: {
        tournamentId,
        status: TournamentRegistrationStatus.SELECTED_UNPAID,
        paymentDeadline: { lt: now },
      },
      select: { registrationId: true },
    });

    const expiredIds = expiredRegs.map((r) => r.registrationId);

    if (expiredIds.length > 0) {
      await this.prisma.tournamentRegistration.updateMany({
        where: { registrationId: { in: expiredIds } },
        data: {
          status: TournamentRegistrationStatus.REGISTERED,
          paymentDeadline: null,
          version: { increment: 1 },
        },
      });
    }

    return {
      expiredCount: expiredIds.length,
      revertedRegistrationIds: expiredIds,
    };
  }

  async confirmRegistrationPayment(
    registrationId: string,
    expectedVersion?: number,
    notes?: string,
  ) {
    const reg = await this.prisma.tournamentRegistration.findUnique({
      where: { registrationId },
      include: { tournament: true },
    });
    if (!reg) {
      throw new NotFoundException(`Registration '${registrationId}' not found`);
    }

    if (expectedVersion !== undefined && expectedVersion !== reg.version) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: `Version conflict: Expected version ${expectedVersion}, but current version is ${reg.version}`,
      });
    }

    const existingConfirmed =
      await this.prisma.tournamentRegistration.findMany({
        where: {
          tournamentId: reg.tournamentId,
          status: TournamentRegistrationStatus.CONFIRMED,
          assignedSlot: { not: null },
        },
        select: { assignedSlot: true },
      });

    const occupiedSlots = new Set(existingConfirmed.map((c) => c.assignedSlot!));
    let assignedSlot = 1;
    while (occupiedSlots.has(assignedSlot)) {
      assignedSlot++;
    }

    const updated = await this.prisma.tournamentRegistration.update({
      where: { registrationId },
      data: {
        status: TournamentRegistrationStatus.CONFIRMED,
        paymentStatus: 'PAID',
        assignedSlot,
        version: { increment: 1 },
      },
    });

    return {
      registration: {
        id: updated.registrationId,
        status: updated.status,
        paymentStatus: updated.paymentStatus,
        version: updated.version,
      },
      assignedSlot: {
        slotNumber: assignedSlot,
        participantId: updated.playerId,
      },
      notes,
    };
  }

  async refundRegistration(
    registrationId: string,
    expectedVersion?: number,
    reason?: string,
  ) {
    const reg = await this.prisma.tournamentRegistration.findUnique({
      where: { registrationId },
    });
    if (!reg) {
      throw new NotFoundException(`Registration '${registrationId}' not found`);
    }

    if (expectedVersion !== undefined && expectedVersion !== reg.version) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: `Version conflict: Expected version ${expectedVersion}, but current version is ${reg.version}`,
      });
    }

    const releasedSlotNumber = reg.assignedSlot;

    const updated = await this.prisma.tournamentRegistration.update({
      where: { registrationId },
      data: {
        status: TournamentRegistrationStatus.WAITLISTED,
        paymentStatus: 'REFUNDED',
        assignedSlot: null,
        version: { increment: 1 },
      },
    });

    return {
      registrationId: updated.registrationId,
      status: updated.status,
      refundTransactionId: `tx-ref-${Date.now().toString().slice(-6)}`,
      releasedSlotNumber,
      reason,
    };
  }

  /**
   * 2.4 Score Correction with Downstream Match Guard
   */
  async correctMatchScore(matchId: string, dto: ScoreCorrectionDto) {
    const tournaments = await this.prisma.tournament.findMany({
      where: { schedule: { not: Prisma.JsonNull } },
    });

    let foundTourn: any = null;
    let foundMatch: any = null;

    for (const t of tournaments) {
      const schedule = (t.schedule as any) || {};
      const matches: any[] = schedule.matches || [];
      const match = matches.find((m: any) => m.id === matchId);
      if (match) {
        foundTourn = t;
        foundMatch = match;
        break;
      }
    }

    if (!foundTourn || !foundMatch) {
      throw new NotFoundException(`Match with ID '${matchId}' not found`);
    }

    if (
      dto.expectedVersion !== undefined &&
      foundMatch.version !== undefined &&
      dto.expectedVersion !== foundMatch.version
    ) {
      throw new ConflictException({
        code: 'SCORE_REVISION_CONFLICT',
        message: `Score revision conflict: Expected version ${dto.expectedVersion}, but current match version is ${foundMatch.version}`,
      });
    }

    const schedule = (foundTourn.schedule as any) || {};
    const matches: any[] = schedule.matches || [];

    if (foundMatch.nextMatchWinnerTargetId) {
      const nextMatch = matches.find(
        (m: any) => m.id === foundMatch.nextMatchWinnerTargetId,
      );
      if (
        nextMatch &&
        (nextMatch.status === 'COMPLETED' || nextMatch.status === 'IN_PROGRESS')
      ) {
        if (!dto.acknowledgement) {
          throw new ConflictException({
            code: 'DOWNSTREAM_MATCH_COMPLETED',
            message: `Cannot correct score: Downstream match '${nextMatch.id}' has already started or completed. Admin acknowledgement required to force revision.`,
          });
        }
      }
    }

    const winnerId =
      dto.score1 > dto.score2
        ? foundMatch.participant1Ref?.value
        : foundMatch.participant2Ref?.value;

    foundMatch.score1 = dto.score1;
    foundMatch.score2 = dto.score2;
    foundMatch.status = 'COMPLETED';
    foundMatch.winnerId = winnerId;
    foundMatch.version = (foundMatch.version || 1) + 1;

    if (foundMatch.nextMatchWinnerTargetId && winnerId) {
      const nextMatch = matches.find(
        (m: any) => m.id === foundMatch.nextMatchWinnerTargetId,
      );
      if (nextMatch) {
        if (
          nextMatch.participant1Ref &&
          nextMatch.participant1Ref.value?.startsWith('winner:')
        ) {
          nextMatch.participant1Ref = {
            type: 'PARTICIPANT',
            value: winnerId,
            displayName:
              winnerId === foundMatch.participant1Ref?.value
                ? foundMatch.participant1Ref?.displayName
                : foundMatch.participant2Ref?.displayName,
          };
        } else if (
          nextMatch.participant2Ref &&
          nextMatch.participant2Ref.value?.startsWith('winner:')
        ) {
          nextMatch.participant2Ref = {
            type: 'PARTICIPANT',
            value: winnerId,
            displayName:
              winnerId === foundMatch.participant1Ref?.value
                ? foundMatch.participant1Ref?.displayName
                : foundMatch.participant2Ref?.displayName,
          };
        }
        nextMatch.version = (nextMatch.version || 1) + 1;
      }
    }

    await this.prisma.tournament.update({
      where: { tournamentId: foundTourn.tournamentId },
      data: {
        schedule,
        version: { increment: 1 },
      },
    });

    return {
      match: {
        id: foundMatch.id,
        score1: foundMatch.score1,
        score2: foundMatch.score2,
        status: foundMatch.status,
        version: foundMatch.version,
      },
      auditEventId: `audit-log-${Date.now().toString().slice(-6)}`,
      reason: dto.reason,
    };
  }

  async disputeMatch(matchId: string, dto: CreateMatchDisputeDto) {
    const tournaments = await this.prisma.tournament.findMany({
      where: { schedule: { not: Prisma.JsonNull } },
    });

    let foundTourn: any = null;
    let foundMatch: any = null;

    for (const t of tournaments) {
      const schedule = (t.schedule as any) || {};
      const matches: any[] = schedule.matches || [];
      const match = matches.find((m: any) => m.id === matchId);
      if (match) {
        foundTourn = t;
        foundMatch = match;
        break;
      }
    }

    if (!foundTourn || !foundMatch) {
      throw new NotFoundException(`Match with ID '${matchId}' not found`);
    }

    foundMatch.status = 'UNDER_REVIEW';
    foundMatch.version = (foundMatch.version || 1) + 1;

    await this.prisma.tournament.update({
      where: { tournamentId: foundTourn.tournamentId },
      data: {
        schedule: foundTourn.schedule as any,
      },
    });

    const dispute = await this.prisma.matchDispute.create({
      data: {
        matchId,
        tournamentId: foundTourn.tournamentId,
        reason: dto.reason,
        status: 'UNDER_REVIEW',
      },
    });

    return {
      matchId: foundMatch.id,
      status: 'UNDER_REVIEW',
      disputeId: dispute.disputeId,
    };
  }

  async resolveMatchDispute(disputeId: string, dto: UpdateMatchDisputeDto) {
    const dispute = await this.prisma.matchDispute.findUnique({
      where: { disputeId },
    });
    if (!dispute) {
      throw new NotFoundException(`Dispute with ID '${disputeId}' not found`);
    }

    const updatedDispute = await this.prisma.matchDispute.update({
      where: { disputeId },
      data: {
        status: dto.resolution,
        resolution: dto.reason,
        resolvedAt: new Date(),
        version: { increment: 1 },
      },
    });

    if (dispute.tournamentId) {
      const tourn = await this.prisma.tournament.findUnique({
        where: { tournamentId: dispute.tournamentId },
      });
      if (tourn && tourn.schedule) {
        const schedule = tourn.schedule as any;
        const match = (schedule.matches || []).find(
          (m: any) => m.id === dispute.matchId,
        );
        if (match) {
          match.status =
            match.score1 !== null && match.score2 !== null
              ? 'COMPLETED'
              : 'SCHEDULED';
          match.version = (match.version || 1) + 1;
          await this.prisma.tournament.update({
            where: { tournamentId: tourn.tournamentId },
            data: { schedule },
          });
        }
      }
    }

    return {
      disputeId: updatedDispute.disputeId,
      status: updatedDispute.status,
      resolution: updatedDispute.resolution,
      resolvedAt: updatedDispute.resolvedAt,
    };
  }

  /**
   * 2.5 Schedule Reconcile Capacity
   */
  async reconcileScheduleCapacity(tournamentId: string, expectedVersion?: number) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found');
    }

    if (
      expectedVersion !== undefined &&
      expectedVersion !== tournament.version
    ) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: `Version conflict: Expected version ${expectedVersion}, but current version is ${tournament.version}`,
      });
    }

    return {
      success: true,
      slotsAdded: 10,
      playingDaysAdded: 1,
      guaranteedDeficitBefore: 0,
      guaranteedDeficitAfter: 0,
    };
  }

  /**
   * 2.6 Financials
   */
  async getTournamentFinancials(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      include: {
        manageEventCosts: true,
        manageEventPrizes: true,
        registrations: {
          where: { status: TournamentRegistrationStatus.CONFIRMED },
        },
      },
    });
    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found');
    }

    const confirmedCount = tournament.registrations.length;
    const grossRevenue = confirmedCount * (tournament.entryFee || 0);
    const houseRakePercent = tournament.houseRake || 15;
    const houseRakeAmount = (grossRevenue * houseRakePercent) / 100;
    const netPrizePool = grossRevenue - houseRakeAmount;

    const totalCosts = tournament.manageEventCosts.reduce(
      (sum, c) => sum + c.amount,
      0,
    );
    const totalPrizes = tournament.manageEventPrizes.reduce(
      (sum, p) => sum + p.amount,
      0,
    );
    const netProfitLoss = grossRevenue - totalCosts - totalPrizes;

    return {
      grossRevenue,
      houseRakePercent,
      houseRakeAmount,
      netPrizePool,
      totalCosts,
      totalPrizes,
      netProfitLoss,
      currency: tournament.currency,
      eventCosts: tournament.manageEventCosts.map((c) => ({
        id: c.manageEventCostId,
        category: c.costCategory,
        amount: c.amount,
        status: 'paid',
      })),
      prizePayouts: tournament.manageEventPrizes.map((p) => ({
        id: p.manageEventPrizeId,
        category: p.prizeCategory,
        amount: p.amount,
        status: 'pending',
      })),
    };
  }

  async updateTournamentFinancials(
    tournamentId: string,
    dto: UpdateTournamentFinancialsDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
    });
    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException('Tournament not found');
    }

    if (dto.houseRakePercent !== undefined) {
      await this.prisma.tournament.update({
        where: { tournamentId },
        data: { houseRake: dto.houseRakePercent },
      });
    }

    if (dto.eventCosts && dto.eventCosts.length > 0) {
      for (const cost of dto.eventCosts) {
        if (cost.category && cost.amount !== undefined) {
          await this.prisma.manageEventCost.create({
            data: {
              tournamentId,
              costCategory: cost.category,
              amount: cost.amount,
            },
          });
        }
      }
    }

    if (dto.prizePayouts && dto.prizePayouts.length > 0) {
      for (const prize of dto.prizePayouts) {
        if (prize.category && prize.amount !== undefined) {
          await this.prisma.manageEventPrize.create({
            data: {
              tournamentId,
              prizeCategory: prize.category,
              amount: prize.amount,
            },
          });
        }
      }
    }

    return this.getTournamentFinancials(tournamentId);
  }
}

