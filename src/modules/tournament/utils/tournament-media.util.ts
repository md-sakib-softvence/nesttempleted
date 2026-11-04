import { getPreSignedUrl } from '../../utils/s3.util';

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);
const isS3HttpUrl = (value: string) =>
  isHttpUrl(value) &&
  (/amazonaws\.com/i.test(value) || /X-Amz-/i.test(value));
const isStoredDocumentKey = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]+$/i.test(
    value,
  ) || /\.(pdf|doc|docx|txt|rtf|png|jpe?g|webp|gif|svg)$/i.test(value);

/**
 * Extracts the raw S3 key if a pre-signed or full S3 URL is passed back from the client,
 * preventing expiring query parameters from being saved in the database.
 */
export function extractStorageKey<T extends string | null | undefined>(
  value: T,
): T {
  if (!value || typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (isS3HttpUrl(trimmed)) {
    try {
      const url = new URL(trimmed);
      const key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      const bucketName = process.env.AWS_S3_BUCKET_NAME;
      if (bucketName && key.startsWith(`${bucketName}/`)) {
        return key.slice(bucketName.length + 1) as T;
      }
      return (key || trimmed) as T;
    } catch {
      return trimmed as T;
    }
  }
  return trimmed as T;
}

/**
 * Safely generates an S3 pre-signed URL for a stored key or S3 URL.
 * Preserves external non-S3 HTTP URLs and falls back gracefully if S3 env is missing.
 */
export async function safePresignUrl(
  value?: string | null,
): Promise<string | null> {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  if (isHttpUrl(str) && !isS3HttpUrl(str)) {
    return str;
  }
  try {
    return (await getPreSignedUrl(str)) || str;
  } catch {
    return str;
  }
}

export const presignLegacyDocument = async (value: string) => {
  if (!value) return value;
  const str = String(value).trim();
  if (isS3HttpUrl(str)) {
    return (await safePresignUrl(str)) || str;
  }
  if (isHttpUrl(str) || !isStoredDocumentKey(str)) return str;
  return (await safePresignUrl(str)) || str;
};

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
    formatted.canvasImage = await safePresignUrl(String(formatted.canvasImage));
  }

  if (formatted.tournamentLogoUrl) {
    formatted.tournamentLogoUrl = await safePresignUrl(
      String(formatted.tournamentLogoUrl),
    );
  }

  if (formatted.playerOrgUrl) {
    formatted.playerOrgUrl = await safePresignUrl(
      String(formatted.playerOrgUrl),
    );
  }

  if (formatted.prOrgUrl) {
    formatted.prOrgUrl = await safePresignUrl(String(formatted.prOrgUrl));
  }

  if (formatted.rules && Array.isArray(formatted.rules)) {
    formatted.rules = await Promise.all(
      formatted.rules.map((rule: string) => presignLegacyDocument(rule)),
    );
  }

  if (formatted.tsAndTc && Array.isArray(formatted.tsAndTc)) {
    formatted.tsAndTc = await Promise.all(
      formatted.tsAndTc.map((doc: string) => presignLegacyDocument(doc)),
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

  // Claim QR tokens are returned only by the authenticated participant's
  // raffle endpoint. Tournament listings/details must never expose them.
  if (Array.isArray(formatted.raffles)) {
    formatted.raffles = formatted.raffles.map((raffle: any) => {
      const winners = Array.isArray(raffle.winners) ? raffle.winners : [];
      return {
        ...raffle,
        winners: winners.map(({ qrCodeString, ...winner }: any) => ({
          ...winner,
          claimAvailable: Boolean(qrCodeString),
        })),
      };
    });
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

  // `prizePool` is a calculated value, not a column on Tournament. Expose the
  // calculated amount on list responses so clients do not have to guess it.
  if (formatted.prizePoolAmount === undefined) {
    const confirmedRegistrations = Array.isArray(formatted.registrations)
      ? formatted.registrations.filter(
          (registration: any) =>
            String(registration?.status || '').toUpperCase() === 'CONFIRMED',
        ).length
      : 0;
    const entryFee = Number(formatted.entryFee || 0);
    const percentage = Number(formatted.percentage ?? 70);
    const fixedPrizeTotal = Array.isArray(formatted.manageEventPrizes)
      ? formatted.manageEventPrizes.reduce(
          (sum: number, prize: any) => sum + Number(prize?.amount || 0),
          0,
        )
      : 0;

    formatted.prizePoolAmount =
      formatted.prizeRule === 'FIXED_AMOUNT'
        ? fixedPrizeTotal
        : (confirmedRegistrations * entryFee * percentage) / 100;
    formatted.prizePoolCurrency = formatted.currency;
  }

  formatted.logo = formatted.tournamentLogoUrl || formatted.canvasImage || null;
  formatted.bannerUrl = formatted.canvasImage || null;
  formatted.organizerLogo = formatted.playerOrgUrl || formatted.prOrgUrl || '';
  formatted.secondaryOrganizerLogo =
    formatted.prOrgUrl || formatted.secondaryOrganizerLogo || null;
  formatted.fanPassArtUrl = formatted.canvasImage || null;
  formatted.rulesUrl =
    (formatted.rules &&
      formatted.rules.find((value: string) => isHttpUrl(value))) ||
    formatted.rules?.[0] ||
    '';
  formatted.termsAndConditionsUrl =
    (formatted.tsAndTc &&
      formatted.tsAndTc.find((value: string) => isHttpUrl(value))) ||
    formatted.tsAndTc?.[0] ||
    '';
  formatted.termsAndConditions = formatted.tsAndTc || [];
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
    formatted.sponsors = await Promise.all(
      formatted.sponsors.map(async (s: any) => {
        let priorityOrder = 2;
        const prio =
          typeof s.priority === 'string' ? s.priority.toUpperCase() : '';
        if (prio === 'GOLD' || prio === 'PRIMARY') priorityOrder = 1;
        else if (prio === 'SILVER' || prio === 'SECONDARY') priorityOrder = 2;
        else if (prio === 'BRONZE' || prio === 'THIRD' || prio === 'TERTIARY')
          priorityOrder = 3;
        else if (prio === 'TEAL') priorityOrder = 4;

        const rawLogo = s.logo || s.logoUrl || null;
        const presignedLogo = rawLogo ? await safePresignUrl(rawLogo) : rawLogo;

        return {
          id: s.sponsorId || s.id,
          name: s.name,
          logo: presignedLogo,
          logoUrl: presignedLogo,
          website: s.website,
          priority: s.priority,
          priorityOrder: s.priorityOrder ?? priorityOrder,
          contractValue: Number(s.value) || 0,
        };
      }),
    );
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
