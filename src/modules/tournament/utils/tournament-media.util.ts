import { getPreSignedUrl } from '../../utils/s3.util';

/**
 * Normalizes tournament media, venues, costs, prizes, registrations, and schedule settings
 * into consistent canonical frontend types.
 */
export async function presignTournamentMedia<T extends Record<string, any>>(
  tournament: T,
  options: { isList?: boolean; include?: string | string[] } = {},
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
  if (
    rawSchedule &&
    typeof rawSchedule === 'object' &&
    !Array.isArray(rawSchedule)
  ) {
    schedulePayload = rawSchedule;
    if (Array.isArray(rawSchedule.calendar)) {
      formatted.schedule = rawSchedule.calendar;
    } else {
      formatted.schedule = [];
    }
  } else if (formatted.schedulePayload) {
    schedulePayload = formatted.schedulePayload;
  }

  // Prevent leaking massive 15MB+ raw schedule payload (matches, slots) into HTTP responses
  delete formatted.schedulePayload;

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
  formatted.format =
    formatMap[formatted.tournamentFormat] || formatted.tournamentFormat;

  formatted.paymentWindowHours = formatted.paymentWindow ?? 24;
  formatted.registrationOpen =
    formatted.registrationOpen !== undefined
      ? formatted.registrationOpen
      : formatted.registrationCutOffMode
        ? true
        : true;
  formatted.registrationMode =
    formatted.registrationCutOffMode === 'DEADLINE' ? 'DEADLINE' : 'CAPACITY';
  formatted.maxCapacity = formatted.capacity || formatted.numberOfTeams;
  formatted.deadlineDate = formatted.deadline
    ? new Date(formatted.deadline).toISOString()
    : undefined;
  formatted.houseRakePercent =
    formatted.houseRake !== null && formatted.houseRake !== undefined
      ? Number(formatted.houseRake)
      : 30;
  formatted.prizePoolConfig = {
    type:
      formatted.prizeRule === 'FIXED_AMOUNT' || formatted.prizeRule === 'FIXED'
        ? 'fixed'
        : 'percentage',
    value:
      formatted.percentage !== null && formatted.percentage !== undefined
        ? Number(formatted.percentage)
        : 70,
  };

  formatted.logo = formatted.tournamentLogoUrl || formatted.canvasImage || null;
  formatted.organizerLogo = formatted.playerOrgUrl || formatted.prOrgUrl || '';
  formatted.secondaryOrganizerLogo = formatted.secondaryOrganizerLogo || null;
  formatted.fanPassArtUrl = formatted.canvasImage || null;
  formatted.rulesUrl = (formatted.rules && formatted.rules[0]) || '';
  formatted.termsAndConditionsUrl =
    (formatted.tsAndTc && formatted.tsAndTc[0]) || '';
  formatted.seriesId =
    formatted.seriesTournaments?.[0]?.seriesId || formatted.seriesId || null;

  // Schedule Settings object
  const schedSettings = schedulePayload?.scheduleSettings || {};
  formatted.scheduleSettings = {
    startDate:
      schedSettings.startDate ||
      (formatted.startDate
        ? new Date(formatted.startDate).toISOString().slice(0, 10)
        : ''),
    eventStartTime:
      schedSettings.eventStartTime || formatted.dailyStart || '10:00',
    eventEndTime: schedSettings.eventEndTime || formatted.dailyEnd || '19:00',
    slotDuration: schedSettings.slotDuration || formatted.matchDuration || 25,
    turnoverDuration:
      schedSettings.turnoverDuration ?? formatted.turnoverDuration ?? 5,
    lunchBreakStartTime:
      schedSettings.lunchBreakStartTime || formatted.lunchBreakTime || '13:00',
    lunchBreakDuration:
      schedSettings.lunchBreakDuration ?? formatted.lunchDuration ?? 60,
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
    frequency:
      freqSettings.frequency ||
      freqNameMap[formatted.frequencyStatus] ||
      'Daily',
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
  formatted.prizePayouts = (formatted.manageEventPrizes || []).map(
    (p: any) => ({
      id: p.manageEventPrizeId || p.id,
      category: p.prizeCategory || p.category,
      amount: Number(p.amount) || 0,
      status: p.status || 'pending',
    }),
  );

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
  const includeTokens: string[] = Array.isArray(options.include)
    ? options.include.map((s) => String(s).toLowerCase().trim())
    : typeof options.include === 'string'
      ? options.include
          .split(',')
          .map((s) => s.toLowerCase().trim())
          .filter(Boolean)
      : [];

  const includeAll =
    includeTokens.includes('all') || includeTokens.includes('full');

  // Ensure default arrays always exist so client contracts are never broken
  if (!formatted.matches) formatted.matches = [];
  if (!formatted.slots) formatted.slots = [];
  if (!formatted.seeds) formatted.seeds = [];
  if (!formatted.groups) formatted.groups = [];

  if (schedulePayload) {
    const rawMatches =
      schedulePayload.canonicalMatches ||
      schedulePayload.matches ||
      schedulePayload.structure?.matches ||
      [];
    const rawSlots =
      schedulePayload.slots || schedulePayload.structure?.slots || [];
    const rawSeeds =
      schedulePayload.seeds || schedulePayload.structure?.seeds || [];
    const rawGroups =
      schedulePayload.groups || schedulePayload.structure?.groups || [];

    const shouldIncludeMatches =
      includeAll || includeTokens.includes('matches');
    const shouldIncludeSlots = includeAll || includeTokens.includes('slots');
    const shouldIncludeSeeds = includeAll || includeTokens.includes('seeds');
    const shouldIncludeGroups = includeAll || includeTokens.includes('groups');

    // Embed matches only if explicitly requested, or if single item and small list (<= 100 items).
    // Large fixtures (e.g. 32,000 matches) are queried via /tournaments/:id/matches
    if (
      !options.isList &&
      (shouldIncludeMatches ||
        (Array.isArray(rawMatches) && rawMatches.length <= 100))
    ) {
      formatted.matches = rawMatches;
    } else {
      formatted.matches = [];
    }

    // Embed slots only if explicitly requested (?include=slots) or small roster (<= 32 slots).
    // For large tournaments (e.g. 254+ teams), slots are omitted by default to keep HTTP payload lightweight (~2KB instead of ~100KB+).
    if (
      !options.isList &&
      (shouldIncludeSlots || (Array.isArray(rawSlots) && rawSlots.length <= 32))
    ) {
      formatted.slots = rawSlots;
    } else {
      formatted.slots = [];
    }

    // Embed seeds only if explicitly requested (?include=seeds) or small roster (<= 32 seeds).
    if (
      !options.isList &&
      (shouldIncludeSeeds || (Array.isArray(rawSeeds) && rawSeeds.length <= 32))
    ) {
      formatted.seeds = rawSeeds;
    } else {
      formatted.seeds = [];
    }

    // Embed groups only if explicitly requested (?include=groups) or small list (<= 32 groups).
    if (
      !options.isList &&
      (shouldIncludeGroups ||
        (Array.isArray(rawGroups) && rawGroups.length <= 32))
    ) {
      formatted.groups = rawGroups;
    } else {
      formatted.groups = [];
    }

    // High-level slot and seeding statistics for fast UI consumption without downloading hundreds of entities
    formatted.slotSummary = {
      totalSlots: Array.isArray(rawSlots) ? rawSlots.length : 0,
      assignedSlots: Array.isArray(rawSlots)
        ? rawSlots.filter(
            (s: any) => s.status === 'ASSIGNED' || s.participantId,
          ).length
        : 0,
      unassignedSlots: Array.isArray(rawSlots)
        ? rawSlots.filter(
            (s: any) => s.status === 'UNASSIGNED' && !s.participantId,
          ).length
        : 0,
      totalSeeds: Array.isArray(rawSeeds) ? rawSeeds.length : 0,
    };

    formatted.guaranteedMatches =
      schedulePayload.summary?.guaranteedMatches ||
      schedulePayload.structure?.summary?.guaranteedMatches ||
      formatted.numberOfTeams;
    formatted.conditionalMatches =
      schedulePayload.summary?.conditionalMatches ||
      schedulePayload.structure?.summary?.conditionalMatches ||
      0;
    formatted.maximumPossibleMatches =
      schedulePayload.summary?.maximumPossibleMatches ||
      schedulePayload.structure?.summary?.maximumPossibleMatches ||
      formatted.numberOfTeams;
  }

  // Normalized Registrations
  if (formatted.registrations && Array.isArray(formatted.registrations)) {
    formatted.registrations = formatted.registrations.map((r: any) => {
      const playerName = r.player
        ? `${r.player.firstName || ''} ${r.player.lastName || ''}`.trim() ||
          r.player.gamerTag ||
          'Player'
        : r.fullName || 'Player';
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
        registrationDate: r.createdAt
          ? new Date(r.createdAt).toISOString()
          : new Date().toISOString(),
        paymentDeadline: r.paymentDeadline
          ? new Date(r.paymentDeadline).toISOString()
          : null,
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
