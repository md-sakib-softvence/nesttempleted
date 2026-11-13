import {
  reconcileCalendarSettings,
  structureFlags,
} from '../utils/competition-runtime.util';
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
import { UpdateTournamentTemplatesDto } from '../dto/tournament/update-templates.dto';
import { UpdateTournamentStatusDto } from '../dto/tournament/update-tournament-status.dto';
import { UpdateTournamentFinancialsDto } from '../dto/tournament/update-financials.dto';
import {
  buildPrismaQuery,
  calculatePaginationMeta,
  QueryOptions,
} from '../../utils/query.util';
import {
  presignTournamentMedia,
  extractStorageKey,
} from '../utils/tournament-media.util';
import {
  TournamentScheduleService,
  Participant,
  ScheduleVenueInput,
} from './tournament-schedule.service';
import {
  SchedulingMode,
  SponsorStatus,
  TournamentRegistrationStatus,
  TournamentFormat,
  Currency,
  PrizeRule,
  RegistrationCutOffMode,
  FrequencyStatus,
  TournamentStatus,
  TournamentGameType,
} from '@prisma/client';
import { normalizeStringArray } from '../utils/file-upload.util';

@Injectable()
export class TournamentCoreService {
  private readonly logger = new Logger(TournamentCoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentScheduleService: TournamentScheduleService,
  ) {}

  /**
   * Structure Generation (POST /tournaments):
   * Calculate match count and produce canonical match entities.
   * Generates capacity metrics, calendar grid, and places matches according to schedulingMode.
   */
  async createTournament(createTournamentDto: CreateTournamentDto) {
    createTournamentDto =
      this.normalizeConfigurationAliases(createTournamentDto);
    if (
      !createTournamentDto.startDate ||
      !Number.isFinite(new Date(createTournamentDto.startDate).getTime())
    )
      throw new BadRequestException('A valid start date is required');
    return this.prisma.$transaction(
      (db) => this.createTournamentInTransaction(createTournamentDto, db),
      { timeout: 30000 },
    );
  }

  private async createTournamentInTransaction(
    createTournamentDto: CreateTournamentDto,
    db: any,
  ) {
    const {
      startDate,
      deadline,
      venues: inputVenues,
      sponsors: inputSponsors,
      manageEventCosts: inputManageEventCosts,
      manageEventPrizes: inputManageEventPrizes,
      playerIds: inputPlayerIds,
      groupsCount,
      thirdPlacePlayoffEnabled = false,
      ...rest
    } = createTournamentDto;

    // 1. Resolve & Create Sponsors first
    const resolvedSponsorIds: string[] = [];
    if (inputSponsors && Array.isArray(inputSponsors)) {
      for (const item of inputSponsors) {
        if (typeof item === 'string') {
          resolvedSponsorIds.push(item);
        } else if (typeof item === 'object' && item !== null && item.name) {
          const createdSponsor = await db.sponsor.create({
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

          const createdVenue = await db.venue.create({
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
          const createdCost = await db.manageEventCost.create({
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
          const createdPrize = await db.manageEventPrize.create({
            data: {
              prizeCategory: item.prizeCategory,
              amount: Number(item.amount) || 0,
            },
          });
          resolvedPrizeIds.push(createdPrize.manageEventPrizeId);
        }
      }
    }

    const schedulingMode =
      createTournamentDto.schedulingMode || SchedulingMode.MANUAL;
    const rules = normalizeStringArray(createTournamentDto.rules);
    const tsAndTc = normalizeStringArray(
      createTournamentDto.termsAndConditions || createTournamentDto.tsAndTc,
    );
    const frequencyArray = normalizeStringArray(
      createTournamentDto.frequencyArray ?? ['0', '1', '2', '3', '4', '5', '6'],
    );

    const tournament = await db.tournament.create({
      data: {
        name: createTournamentDto.name,
        gameTitle:
          createTournamentDto.gameTitle ||
          (createTournamentDto as any).game ||
          'EAFC 25',
        gameType: createTournamentDto.gameType || TournamentGameType.OTHER,
        tournamentFormat:
          createTournamentDto.tournamentFormat || TournamentFormat.LEAGUE,
        numberOfTeams:
          createTournamentDto.numberOfTeams || createTournamentDto.teams || 8,
        entryFee: createTournamentDto.entryFee ?? 0,
        currency: createTournamentDto.currency || Currency.NGN,
        paymentWindow: createTournamentDto.paymentWindow || 48,
        prizeRule: createTournamentDto.prizeRule || PrizeRule.PERCENTAGE,
        percentage: createTournamentDto.percentage ?? 70,
        houseRake: createTournamentDto.houseRake ?? 10,
        couponCreation: createTournamentDto.couponCreation ?? false,
        registrationCutOffMode:
          createTournamentDto.registrationCutOffMode ||
          RegistrationCutOffMode.CAPACITY,
        schedulingMode,
        ...(schedulingMode === SchedulingMode.PLAYER_SELF &&
          createTournamentDto.schedulingWindowOpen !== undefined && {
            schedulingPaused: !createTournamentDto.schedulingWindowOpen,
          }),
        startDate: new Date(startDate || Date.now() + 86400000),
        deadline: new Date(deadline || Date.now() + 7 * 86400000),
        capacity:
          createTournamentDto.capacity || createTournamentDto.maxCapacity || 64,
        dailyStart: createTournamentDto.dailyStart || '09:00',
        dailyEnd: createTournamentDto.dailyEnd || '17:00',
        matchDuration: createTournamentDto.matchDuration || 20,
        turnoverDuration: createTournamentDto.turnoverDuration ?? 5,
        lunchBreakTime: createTournamentDto.lunchBreakTime || '13:00',
        lunchDuration: createTournamentDto.lunchDuration ?? 60,
        buffer: createTournamentDto.buffer ?? 0,
        frequencyStatus:
          createTournamentDto.frequencyStatus || FrequencyStatus.DAILY,
        frequencyArray,
        tournamentLogo: extractStorageKey(
          createTournamentDto.tournamentLogo ||
            createTournamentDto.tournamentLogoUrl ||
            createTournamentDto.logo,
        ),
        tournamentBanner: extractStorageKey(
          createTournamentDto.tournamentBanner ||
            createTournamentDto.canvasImage ||
            createTournamentDto.banner ||
            createTournamentDto.bannerUrl,
        ),
        primaryOrganization: extractStorageKey(
          createTournamentDto.primaryOrganization ||
            createTournamentDto.playerOrgUrl ||
            createTournamentDto.organizerLogo,
        ),
        secondaryOrganization: extractStorageKey(
          createTournamentDto.secondaryOrganization ||
            createTournamentDto.prOrgUrl ||
            createTournamentDto.secondaryOrganizerLogo,
        ),
        fanPassLogo: extractStorageKey(createTournamentDto.fanPassLogo),
        fanPassBg: extractStorageKey(
          createTournamentDto.fanPassBg || createTournamentDto.fanPassArtUrl,
        ),
        playerOrgUrl: extractStorageKey(
          createTournamentDto.primaryOrganization ||
            createTournamentDto.playerOrgUrl ||
            createTournamentDto.organizerLogo,
        ),
        prOrgUrl: extractStorageKey(
          createTournamentDto.secondaryOrganization ||
            createTournamentDto.prOrgUrl ||
            createTournamentDto.secondaryOrganizerLogo,
        ),
        tournamentLogoUrl: extractStorageKey(
          createTournamentDto.tournamentLogo ||
            createTournamentDto.tournamentLogoUrl ||
            createTournamentDto.logo,
        ),
        canvasImage: extractStorageKey(
          createTournamentDto.tournamentBanner ||
            createTournamentDto.canvasImage ||
            createTournamentDto.banner ||
            createTournamentDto.bannerUrl,
        ),
        rules,
        tsAndTc,
        status:
          createTournamentDto.status ||
          (createTournamentDto.isDraft
            ? TournamentStatus.DRAFT
            : TournamentStatus.REGISTRATION_OPEN),
        registrationOpen:
          createTournamentDto.registrationOpen !== undefined
            ? createTournamentDto.registrationOpen
            : !createTournamentDto.isDraft &&
              (!createTournamentDto.status ||
                createTournamentDto.status ===
                  TournamentStatus.REGISTRATION_OPEN),
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
        const count = await db.seriesTournament.count({
          where: { seriesId: createTournamentDto.seriesId },
        });
        await db.seriesTournament.create({
          data: {
            seriesId: createTournamentDto.seriesId,
            tournamentId: tournament.tournamentId,
            sequenceOrder: count + 1,
          },
        });
      } catch (err: any) {
        this.logger.warn(
          `Failed to link tournament to series ${createTournamentDto.seriesId}: ${err?.message}`,
        );
      }
    }

    const tournamentVenues = tournament.venues || [];

    // Resolve participating players
    let participants: Participant[] = [];
    if (
      inputPlayerIds &&
      Array.isArray(inputPlayerIds) &&
      inputPlayerIds.length > 0
    ) {
      const players = await db.player.findMany({
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
      participants = [];
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
        topQualifiers: createTournamentDto.topQualifiers,
        hasGrandFinalReset: createTournamentDto.grandFinalResetEnabled ?? false,
        thirdPlacePlayoffEnabled,
        schedulingPolicy:
          schedulingMode === SchedulingMode.PLAYER_SELF
            ? {
                isWindowOpen: createTournamentDto.schedulingWindowOpen ?? false,
              }
            : undefined,
      });

    // Update tournament with generated schedule in database
    await db.tournament.update({
      where: { tournamentId: tournament.tournamentId },
      data: { schedule: schedulePayload as any },
    });

    const result = {
      ...tournament,
      schedule: schedulePayload,
    };

    return presignTournamentMedia(result);
  }

  async getAllTournaments(query: QueryOptions = {}) {
    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      ['name', 'gameTitle', 'tournamentId'],
    );

    where.isDeleted = false;

    // Normalize format to tournamentFormat
    if (where.format) {
      where.tournamentFormat = mapTournamentFormat(where.format);
      delete where.format;
    } else if (where.tournamentFormat) {
      where.tournamentFormat = mapTournamentFormat(where.tournamentFormat);
    }

    // Filter out status if 'ALL' or 'all'
    if (where.status === 'ALL' || where.status === 'all' || !where.status) {
      delete where.status;
    }

    // Filter out gameTitle if 'ALL' or 'all'
    if (where.gameTitle === 'ALL' || where.gameTitle === 'all') {
      delete where.gameTitle;
    }

    if (where.id) {
      where.tournamentId = where.id;
      delete where.id;
    }

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
      data.map((item) => presignTournamentMedia(item, { isList: true })),
    );

    const meta = calculatePaginationMeta(total, page, limit);

    return { data: formattedData, meta };
  }

  async getActiveUpcomingTournaments(query: QueryOptions = {}) {
    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      ['name', 'gameTitle', 'tournamentId'],
    );

    where.isDeleted = false;

    if (where.id) {
      where.tournamentId = where.id;
      delete where.id;
    }

    // Filter out status if 'ALL' or 'all'
    if (where.status === 'ALL' || where.status === 'all') {
      delete where.status;
    } else if (!where.status) {
      // Default to Active & Upcoming statuses
      where.status = {
        in: [
          TournamentStatus.REGISTRATION_OPEN,
          TournamentStatus.UPCOMING,
          TournamentStatus.ONGOING,
          TournamentStatus.IN_PROGRESS,
        ],
      };
    }

    if (where.gameTitle === 'ALL' || where.gameTitle === 'all') {
      delete where.gameTitle;
    }

    // Default sorting: if no custom sortBy provided, order by startDate asc
    const customOrderBy = query.sortBy
      ? orderBy
      : { startDate: (query.sortOrder as 'asc' | 'desc') || 'asc' };

    const [data, total] = await Promise.all([
      this.prisma.tournament.findMany({
        where,
        skip,
        take,
        orderBy: customOrderBy,
        select: {
          tournamentId: true,
          name: true,
          gameTitle: true,
          gameType: true,
          status: true,
          numberOfTeams: true,
          capacity: true,
          startDate: true,
          schedule: true,
          registrations: {
            where: {
              status: { not: TournamentRegistrationStatus.CANCELLED },
            },
            select: {
              status: true,
            },
          },
        },
      }),
      this.prisma.tournament.count({ where }),
    ]);

    const formattedData = data.map((t) => {
      // Roster counts
      const activeRegistrations = t.registrations || [];
      const currentRoster = activeRegistrations.length;
      const maxRoster = t.numberOfTeams || t.capacity || 0;
      const roster = `${currentRoster} / ${maxRoster}`;

      // Progress calculations from schedule
      const schedule = (t.schedule as any) || {};
      const matches: any[] =
        schedule.structure?.matches || schedule.matches || [];
      const totalMatches = matches.length;
      const playedMatches = matches.filter(
        (m: any) => m.status === 'COMPLETED' || m.status === 'NO_SHOW',
      ).length;
      const progress =
        totalMatches > 0 ? Math.round((playedMatches / totalMatches) * 100) : 0;
      const progressPercentage = `${progress}%`;

      // Start Date formatting: e.g. "Nov 20, 2026"
      const formattedStartDate = t.startDate
        ? new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(new Date(t.startDate))
        : '';

      return {
        id: t.tournamentId,
        tournamentId: t.tournamentId,
        name: t.name,
        gameTitle: t.gameTitle,
        gameType: t.gameType,
        status: t.status,
        roster,
        currentRoster,
        maxRoster,
        progress,
        progressPercentage,
        startDate: t.startDate,
        formattedStartDate,
      };
    });

    const meta = calculatePaginationMeta(total, page, limit);

    return { data: formattedData, meta };
  }

  async getTournamentById(id: string, include?: string) {
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
        ticketTiers: true,
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

    return presignTournamentMedia(tournament, { include });
  }

  private normalizeConfigurationAliases(dto: any) {
    const input: any = { ...dto };
    const nested = input.scheduleSettings || {};
    const aliases: Record<string, string[]> = {
      dailyStart: ['eventStartTime', 'dailyStart'],
      dailyEnd: ['eventEndTime', 'dailyEnd'],
      matchDuration: ['slotDuration', 'matchDuration'],
      turnoverDuration: ['turnoverDuration'],
      lunchBreakTime: ['lunchBreakStartTime', 'lunchBreakTime'],
      lunchDuration: ['lunchBreakDuration', 'lunchDuration'],
      startDate: ['startDate'],
      thirdPlacePlayoffEnabled: ['thirdPlacePlayoffEnabled'],
      grandFinalResetEnabled: ['grandFinalResetEnabled'],
    };
    for (const [field, keys] of Object.entries(aliases)) {
      if (input[field] === undefined)
        for (const key of keys)
          if (nested[key] !== undefined) {
            input[field] = nested[key];
            break;
          }
    }
    const frequency = input.frequencySettings || {};
    if (
      input.frequencyStatus === undefined &&
      (frequency.frequency || frequency.frequencyStatus)
    )
      input.frequencyStatus = mapFrequencyStatus(
        frequency.frequency || frequency.frequencyStatus,
      );
    if (
      input.frequencyArray === undefined &&
      (frequency.playingDays || frequency.frequencyArray)
    )
      input.frequencyArray = (
        frequency.playingDays || frequency.frequencyArray
      ).map(String);
    if (input.buffer === undefined && frequency.buffer !== undefined)
      input.buffer = frequency.buffer;
    if (input.capacity === undefined && input.maxCapacity !== undefined)
      input.capacity = input.maxCapacity;
    if (
      input.schedulingWindowOpen === undefined &&
      input.schedulingPaused !== undefined
    )
      input.schedulingWindowOpen = !input.schedulingPaused;
    if (input.tournamentFormat === undefined && input.format !== undefined)
      input.tournamentFormat = mapTournamentFormat(input.format);
    if (input.numberOfTeams === undefined && input.teams !== undefined)
      input.numberOfTeams = Number(input.teams);
    for (const key of [
      'matchDuration',
      'turnoverDuration',
      'lunchDuration',
      'buffer',
      'topQualifiers',
      'groupsCount',
      'capacity',
    ])
      if (input[key] !== undefined) input[key] = Number(input[key]);
    for (const key of ['thirdPlacePlayoffEnabled', 'grandFinalResetEnabled'])
      if (input[key] !== undefined) {
        if (![true, false, 'true', 'false'].includes(input[key]))
          throw new BadRequestException(`Invalid boolean setting: ${key}`);
        input[key] = input[key] === true || input[key] === 'true';
      }
    return input;
  }

  async updateTournament(id: string, updateTournamentDto: UpdateTournamentDto) {
    const input = this.normalizeConfigurationAliases(updateTournamentDto);
    return this.prisma.$transaction(
      (db) => this.updateTournamentInTransaction(id, input, db),
      { timeout: 30000 },
    );
  }

  private async updateTournamentInTransaction(
    id: string,
    updateTournamentDto: UpdateTournamentDto,
    db: any,
  ) {
    const existing = await db.tournament.findUnique({
      where: { tournamentId: id },
      include: { venues: { include: { screens: true } } },
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

    const structure = existing.schedule?.structure;
    if (structure) {
      const input: any = updateTournamentDto;
      const flags = structureFlags(structure);
      const changes: Array<[any, any]> = [
        [input.numberOfTeams ?? input.teams, existing.numberOfTeams],
        [
          input.tournamentFormat ??
            (input.format ? mapTournamentFormat(input.format) : undefined),
          existing.tournamentFormat,
        ],
        [
          structure.groups?.length ? input.groupsCount : undefined,
          structure.groupsCount ?? structure.groups?.length,
        ],
        [
          structure.groups?.length ? input.topQualifiers : undefined,
          structure.topQualifiers ?? 2,
        ],
        [input.thirdPlacePlayoffEnabled, flags.thirdPlacePlayoffEnabled],
        [input.grandFinalResetEnabled, flags.hasGrandFinalReset],
      ];
      if (
        changes.some(
          ([proposed, current]) =>
            proposed !== undefined && proposed !== current,
        )
      )
        throw new BadRequestException(
          'Sporting structure cannot be changed after generation',
        );
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
    delete updateData.schedule; // Clients never supply authoritative matches or allocations.

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
    delete updateData.termsAndConditions;
    delete updateData.logo;
    delete updateData.banner;
    delete updateData.bannerUrl;
    delete updateData.organizerLogo;
    delete updateData.secondaryOrganizerLogo;
    delete updateData.fanPassArtUrl;
    delete updateData.isDraft;
    delete updateData.schedulingWindowOpen;
    delete updateData.thirdPlacePlayoffEnabled;
    delete updateData.groupsCount;

    // Map frontend aliases to Prisma fields if provided
    if (updateTournamentDto.format && !updateTournamentDto.tournamentFormat) {
      updateData.tournamentFormat = mapTournamentFormat(
        updateTournamentDto.format,
      );
    }
    if (
      updateTournamentDto.teams !== undefined &&
      updateTournamentDto.numberOfTeams === undefined
    ) {
      updateData.numberOfTeams = Number(updateTournamentDto.teams);
    }
    if (
      updateTournamentDto.paymentWindowHours !== undefined &&
      updateTournamentDto.paymentWindow === undefined
    ) {
      updateData.paymentWindow = Number(updateTournamentDto.paymentWindowHours);
    }
    if (updateTournamentDto.rulesUrl) {
      updateData.rules = [extractStorageKey(updateTournamentDto.rulesUrl)];
    }
    if (updateTournamentDto.termsAndConditionsUrl) {
      updateData.tsAndTc = [
        extractStorageKey(updateTournamentDto.termsAndConditionsUrl),
      ];
    }
    const bannerVal =
      updateTournamentDto.tournamentBanner ??
      updateTournamentDto.canvasImage ??
      updateTournamentDto.bannerUrl ??
      (updateTournamentDto as any).banner;
    if (bannerVal !== undefined) {
      updateData.tournamentBanner = extractStorageKey(bannerVal);
      updateData.canvasImage = updateData.tournamentBanner;
    }

    const logoVal =
      updateTournamentDto.tournamentLogo ??
      updateTournamentDto.tournamentLogoUrl ??
      updateTournamentDto.logo;
    if (logoVal !== undefined) {
      updateData.tournamentLogo = extractStorageKey(logoVal);
      updateData.tournamentLogoUrl = updateData.tournamentLogo;
    }

    const primaryOrgVal =
      updateTournamentDto.primaryOrganization ??
      updateTournamentDto.playerOrgUrl ??
      updateTournamentDto.organizerLogo;
    if (primaryOrgVal !== undefined) {
      updateData.primaryOrganization = extractStorageKey(primaryOrgVal);
      updateData.playerOrgUrl = updateData.primaryOrganization;
    }

    const secondaryOrgVal =
      updateTournamentDto.secondaryOrganization ??
      updateTournamentDto.prOrgUrl ??
      updateTournamentDto.secondaryOrganizerLogo;
    if (secondaryOrgVal !== undefined) {
      updateData.secondaryOrganization = extractStorageKey(secondaryOrgVal);
      updateData.prOrgUrl = updateData.secondaryOrganization;
    }

    if (updateTournamentDto.fanPassLogo !== undefined) {
      updateData.fanPassLogo = extractStorageKey(
        updateTournamentDto.fanPassLogo,
      );
    }

    const fanBgVal =
      updateTournamentDto.fanPassBg ?? updateTournamentDto.fanPassArtUrl;
    if (fanBgVal !== undefined) {
      updateData.fanPassBg = extractStorageKey(fanBgVal);
    }
    if (updateTournamentDto.prizeRule !== undefined) {
      updateData.prizeRule = mapPrizeRule(updateTournamentDto.prizeRule);
    } else if (updateTournamentDto.prizePoolConfig?.type) {
      updateData.prizeRule = mapPrizeRule(
        updateTournamentDto.prizePoolConfig.type,
      );
    }
    if (updateTournamentDto.percentage !== undefined) {
      updateData.percentage = Number(updateTournamentDto.percentage);
    } else if (updateTournamentDto.prizePoolConfig?.value !== undefined) {
      updateData.percentage = Number(updateTournamentDto.prizePoolConfig.value);
    }
    if (updateTournamentDto.houseRake !== undefined) {
      updateData.houseRake = Number(updateTournamentDto.houseRake);
    } else if (updateTournamentDto.houseRakePercent !== undefined) {
      updateData.houseRake = Number(updateTournamentDto.houseRakePercent);
    }
    if (updateTournamentDto.registrationMode) {
      updateData.registrationCutOffMode = mapRegistrationMode(
        updateTournamentDto.registrationMode,
      );
    }
    if (updateTournamentDto.maxCapacity !== undefined) {
      updateData.capacity = Number(updateTournamentDto.maxCapacity);
    }
    if (updateTournamentDto.isDraft === true) {
      updateData.status = TournamentStatus.DRAFT;
    }
    if (updateTournamentDto.schedulingWindowOpen !== undefined) {
      updateData.schedulingPaused = !updateTournamentDto.schedulingWindowOpen;
    }
    if (updateTournamentDto.deadlineDate) {
      updateData.deadline = new Date(updateTournamentDto.deadlineDate);
    }
    if (updateTournamentDto.scheduleSettings) {
      const ss = updateTournamentDto.scheduleSettings;
      if (ss.startDate) updateData.startDate = new Date(ss.startDate);
      if (ss.eventStartTime) updateData.dailyStart = ss.eventStartTime;
      if (ss.eventEndTime) updateData.dailyEnd = ss.eventEndTime;
      if (ss.slotDuration !== undefined)
        updateData.matchDuration = Number(ss.slotDuration);
      if (ss.turnoverDuration !== undefined)
        updateData.turnoverDuration = Number(ss.turnoverDuration);
      if (ss.lunchBreakStartTime)
        updateData.lunchBreakTime = ss.lunchBreakStartTime;
      if (ss.lunchBreakDuration !== undefined)
        updateData.lunchDuration = Number(ss.lunchBreakDuration);
    }
    if (updateTournamentDto.frequencySettings) {
      const fs = updateTournamentDto.frequencySettings;
      if (fs.frequency)
        updateData.frequencyStatus = mapFrequencyStatus(fs.frequency);
      if (fs.buffer !== undefined) updateData.buffer = Number(fs.buffer);
      if (fs.playingDays)
        updateData.frequencyArray = fs.playingDays.map(String);
    }

    if (startDate) {
      updateData.startDate = new Date(startDate);
    }
    if (deadline) {
      updateData.deadline = new Date(deadline);
    }
    if (updateData.canvasImage !== undefined) {
      updateData.canvasImage = extractStorageKey(updateData.canvasImage);
    }
    if (updateData.tournamentLogoUrl !== undefined) {
      updateData.tournamentLogoUrl = extractStorageKey(
        updateData.tournamentLogoUrl,
      );
    }
    if (updateData.playerOrgUrl !== undefined) {
      updateData.playerOrgUrl = extractStorageKey(updateData.playerOrgUrl);
    }
    if (updateData.prOrgUrl !== undefined) {
      updateData.prOrgUrl = extractStorageKey(updateData.prOrgUrl);
    }
    if (rest.rules !== undefined) {
      updateData.rules = normalizeStringArray(rest.rules).map((r) =>
        extractStorageKey(r),
      );
    }
    const terms =
      updateTournamentDto.termsAndConditions !== undefined
        ? updateTournamentDto.termsAndConditions
        : rest.tsAndTc;
    if (terms !== undefined) {
      updateData.tsAndTc = normalizeStringArray(terms).map((t) =>
        extractStorageKey(t),
      );
    }
    if (rest.frequencyArray !== undefined) {
      updateData.frequencyArray = normalizeStringArray(rest.frequencyArray);
    }

    // Resolve & Upsert Costs
    const resolvedCostIds: string[] = [];
    if (updateManageEventCosts && Array.isArray(updateManageEventCosts)) {
      for (const item of updateManageEventCosts) {
        if (typeof item === 'string') {
          resolvedCostIds.push(item);
        } else if (
          typeof item === 'object' &&
          item !== null &&
          (item.costCategory || item.category || item.name)
        ) {
          const costId = item.id || item.manageEventCostId;
          const costCategory =
            item.costCategory || item.category || item.name || 'Cost';
          const amount = Number(item.amount) || 0;
          if (costId) {
            await db.manageEventCost.update({
              where: { manageEventCostId: costId },
              data: { costCategory, amount, tournamentId: id },
            });
            resolvedCostIds.push(costId);
          } else {
            const createdCost = await db.manageEventCost.create({
              data: {
                tournamentId: id,
                costCategory,
                amount,
              },
            });
            resolvedCostIds.push(createdCost.manageEventCostId);
          }
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

    // Resolve & Upsert Prizes
    const resolvedPrizeIds: string[] = [];
    if (updateManageEventPrizes && Array.isArray(updateManageEventPrizes)) {
      for (const item of updateManageEventPrizes) {
        if (typeof item === 'string') {
          resolvedPrizeIds.push(item);
        } else if (
          typeof item === 'object' &&
          item !== null &&
          (item.prizeCategory ||
            item.category ||
            item.label ||
            item.place !== undefined)
        ) {
          const prizeId = item.id || item.manageEventPrizeId;
          const prizeCategory =
            item.prizeCategory ||
            item.label ||
            item.category ||
            `Place ${item.place || 1}`;
          const amount =
            Number(item.amount !== undefined ? item.amount : item.payout) || 0;
          if (prizeId) {
            await db.manageEventPrize.update({
              where: { manageEventPrizeId: prizeId },
              data: { prizeCategory, amount, tournamentId: id },
            });
            resolvedPrizeIds.push(prizeId);
          } else {
            const createdPrize = await db.manageEventPrize.create({
              data: {
                tournamentId: id,
                prizeCategory,
                amount,
              },
            });
            resolvedPrizeIds.push(createdPrize.manageEventPrizeId);
          }
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

    // Resolve & Upsert Sponsors
    const resolvedSponsorIds: string[] = [];
    if (updateSponsors && Array.isArray(updateSponsors)) {
      for (const item of updateSponsors) {
        if (typeof item === 'string') {
          resolvedSponsorIds.push(item);
        } else if (typeof item === 'object' && item !== null && item.name) {
          const sponsorId = item.id || item.sponsorId;
          const sponsorData = {
            name: item.name,
            logo: item.logo || item.logoUrl,
            website: item.website,
            priority: item.priority || item.tier,
            contact: item.contact,
            value: item.value !== undefined ? Number(item.value) : undefined,
            status: item.status || SponsorStatus.BOTH,
            tournamentId: id,
          };
          if (sponsorId) {
            await db.sponsor.update({
              where: { sponsorId },
              data: sponsorData,
            });
            resolvedSponsorIds.push(sponsorId);
          } else {
            const createdSponsor = await db.sponsor.create({
              data: sponsorData,
            });
            resolvedSponsorIds.push(createdSponsor.sponsorId);
          }
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

    // Resolve & Upsert Venues and Screens
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
          const venueId = item.id || item.venueId;
          const rawScreens =
            item.screens && Array.isArray(item.screens) ? item.screens : [];

          if (venueId) {
            // Update existing venue
            await db.venue.update({
              where: { venueId },
              data: {
                name: item.name || 'Venue',
                address: item.address || '',
                tournamentId: id,
              },
            });
            resolvedUpdateVenueIds.push(venueId);

            // Sync screens for this venue
            if (rawScreens.length > 0) {
              const existingScreens = await db.screen.findMany({
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
                  await db.screen.create({
                    data: { venueId, screenName },
                  });
                }
              }
            }
          } else {
            // Create new venue and screens
            const screens = rawScreens.map((s: any) => ({
              screenName:
                typeof s === 'string'
                  ? s
                  : s?.name || s?.screenName || 'Screen',
            }));
            const createdVenue = await db.venue.create({
              data: {
                tournamentId: id,
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
      'tournamentLogo',
      'tournamentBanner',
      'primaryOrganization',
      'secondaryOrganization',
      'fanPassLogo',
      'fanPassBg',
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

    if (structure) {
      const venues = await db.venue.findMany({
        where: {
          venueId: {
            in: resolvedUpdateVenueIds.length
              ? resolvedUpdateVenueIds
              : existing.venues.map((v: any) => v.venueId),
          },
        },
        include: { screens: true },
      });
      const nextSchedule = JSON.parse(JSON.stringify(existing.schedule));
      const physicalKeys = [
        'startDate',
        'dailyStart',
        'dailyEnd',
        'matchDuration',
        'turnoverDuration',
        'lunchBreakTime',
        'lunchDuration',
        'buffer',
        'frequencyStatus',
        'frequencyArray',
      ];
      const changed =
        updateVenues !== undefined ||
        physicalKeys.some(
          (key) =>
            filteredUpdateData[key] !== undefined &&
            JSON.stringify(filteredUpdateData[key]) !==
              JSON.stringify(existing[key]),
        );
      if (changed)
        reconcileCalendarSettings(nextSchedule, {
          ...existing,
          ...filteredUpdateData,
          venues,
        });
      const windows = (updateTournamentDto as any).matchdayWindows;
      if (windows?.length) {
        const found = new Set<string>();
        for (const venue of nextSchedule.calendar)
          for (const screen of venue.screens)
            for (const day of screen.days) {
              const policy = windows.find((w: any) => w.date === day.date);
              if (policy) {
                day.schedulingPolicy = {
                  isWindowOpen: policy.isWindowOpen,
                  windowOpenTime: policy.windowOpenTime || '',
                  windowCloseTime: policy.windowCloseTime || '',
                };
                found.add(day.date);
              }
            }
        if (windows.some((w: any) => !found.has(w.date)))
          throw new BadRequestException('Unknown matchday booking window date');
      }
      filteredUpdateData.schedule = nextSchedule;
    }
    const updated = await db.tournament.update({
      where: { tournamentId: id, version: existing.version },
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
        const existingLink = await db.seriesTournament.findFirst({
          where: { tournamentId: id },
        });
        if (!existingLink) {
          const count = await db.seriesTournament.count({
            where: { seriesId: updateTournamentDto.seriesId },
          });
          await db.seriesTournament.create({
            data: {
              seriesId: updateTournamentDto.seriesId,
              tournamentId: id,
              sequenceOrder: count + 1,
            },
          });
        } else if (existingLink.seriesId !== updateTournamentDto.seriesId) {
          await db.seriesTournament.update({
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
        this.logger.warn(
          `Failed to update series link for tournament ${id}: ${err?.message}`,
        );
      }
    }

    return presignTournamentMedia(updated);
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
            screenName:
              typeof s === 'string' ? s : s.name || s.screenName || 'Screen',
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
      throw new NotFoundException(
        `Venue '${venueId}' not found for this tournament`,
      );
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
      return (
        alloc && (alloc.venueId === venueId || screenIds.has(alloc.screenId))
      );
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
          ? { playerCardTemplate: dto.playerCardTemplate }
          : {}),
        ...(dto.fanPassTemplate !== undefined
          ? { fanPassTemplate: dto.fanPassTemplate }
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
