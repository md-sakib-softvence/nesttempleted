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
import { presignTournamentMedia } from '../utils/tournament-media.util';
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

    const schedulingMode =
      createTournamentDto.schedulingMode || SchedulingMode.MANUAL;
    const rules = normalizeStringArray(createTournamentDto.rules);
    const tsAndTc = normalizeStringArray(
      createTournamentDto.termsAndConditions || createTournamentDto.tsAndTc,
    );
    const frequencyArray = normalizeStringArray(
      createTournamentDto.frequencyArray,
    );

    const tournament = await this.prisma.tournament.create({
      data: {
        name: createTournamentDto.name,
        gameTitle:
          createTournamentDto.gameTitle ||
          (createTournamentDto as any).game ||
          'EAFC 25',
        tournamentFormat:
          createTournamentDto.tournamentFormat ||
          TournamentFormat.SINGLE_ELIMINATION,
        numberOfTeams: createTournamentDto.numberOfTeams || 16,
        entryFee: createTournamentDto.entryFee ?? 0,
        currency: createTournamentDto.currency || Currency.NGN,
        paymentWindow: createTournamentDto.paymentWindow || 24,
        prizeRule: createTournamentDto.prizeRule || PrizeRule.PERCENTAGE,
        percentage: createTournamentDto.percentage ?? 70,
        houseRake: createTournamentDto.houseRake ?? 30,
        couponCreation: createTournamentDto.couponCreation ?? false,
        registrationCutOffMode:
          createTournamentDto.registrationCutOffMode ||
          RegistrationCutOffMode.CAPACITY,
        schedulingMode,
        startDate: new Date(startDate || Date.now() + 86400000),
        deadline: new Date(deadline || Date.now() + 7 * 86400000),
        capacity:
          createTournamentDto.capacity ||
          createTournamentDto.numberOfTeams ||
          16,
        dailyStart: createTournamentDto.dailyStart || '10:00',
        dailyEnd: createTournamentDto.dailyEnd || '19:00',
        matchDuration: createTournamentDto.matchDuration || 25,
        turnoverDuration: createTournamentDto.turnoverDuration ?? 5,
        lunchBreakTime: createTournamentDto.lunchBreakTime || '13:00',
        lunchDuration: createTournamentDto.lunchDuration ?? 60,
        buffer: createTournamentDto.buffer ?? 0,
        frequencyStatus:
          createTournamentDto.frequencyStatus || FrequencyStatus.DAILY,
        frequencyArray,
        playerOrgUrl:
          createTournamentDto.playerOrgUrl || createTournamentDto.organizerLogo,
        prOrgUrl: createTournamentDto.prOrgUrl,
        tournamentLogoUrl:
          createTournamentDto.tournamentLogoUrl ||
          createTournamentDto.tournamentLogo ||
          createTournamentDto.logo,
        canvasImage:
          createTournamentDto.canvasImage || createTournamentDto.fanPassArtUrl,
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
        this.logger.warn(
          `Failed to link tournament to series ${createTournamentDto.seriesId}: ${err?.message}`,
        );
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
    delete updateData.termsAndConditions;
    delete updateData.logo;
    delete updateData.organizerLogo;
    delete updateData.secondaryOrganizerLogo;
    delete updateData.fanPassArtUrl;
    delete updateData.isDraft;

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
    if (updateTournamentDto.secondaryOrganizerLogo) {
      updateData.prOrgUrl = updateTournamentDto.secondaryOrganizerLogo;
    }
    if (updateTournamentDto.fanPassArtUrl) {
      updateData.canvasImage = updateTournamentDto.fanPassArtUrl;
    }
    if (updateTournamentDto.prizePoolConfig) {
      if (updateTournamentDto.prizePoolConfig.type) {
        updateData.prizeRule = mapPrizeRule(
          updateTournamentDto.prizePoolConfig.type,
        );
      }
      if (updateTournamentDto.prizePoolConfig.value !== undefined) {
        updateData.percentage = Number(
          updateTournamentDto.prizePoolConfig.value,
        );
      }
    }
    if (updateTournamentDto.houseRakePercent !== undefined) {
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
    if (rest.rules !== undefined) {
      updateData.rules = normalizeStringArray(rest.rules);
    }
    const terms =
      updateTournamentDto.termsAndConditions !== undefined
        ? updateTournamentDto.termsAndConditions
        : rest.tsAndTc;
    if (terms !== undefined) {
      updateData.tsAndTc = normalizeStringArray(terms);
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
