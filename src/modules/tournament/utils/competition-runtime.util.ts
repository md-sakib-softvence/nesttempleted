import { BadRequestException } from '@nestjs/common';
import {
  TournamentSchedulePayload,
  TournamentMatchEntity,
  MatchParticipantRef,
  calculateCapacity,
  calculateDayTimeslots,
  generatePlayingDates,
  buildEmptyScheduleGrid,
  timeStringToMinutes,
  summarizeTournamentMatches,
  largestPowerOfTwoNotExceeding,
  allocateMatch,
  resolveDoubleEliminationPlacementRefs,
} from './tournament-calculation.util';

const terminal = (m: any) =>
  ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(m.status);
const real = (m: any) =>
  !m.isAutoAdvance &&
  m.participant1Ref?.type !== 'BYE' &&
  m.participant2Ref?.type !== 'BYE';
const active = (m: any) => real(m) && m.isSchedulable !== false;
const validScore = (n: any) => Number.isInteger(n) && n >= 0;

export function resolveReference(
  schedule: TournamentSchedulePayload,
  ref: MatchParticipantRef,
  seen = new Set<string>(),
): string | undefined {
  if (!ref) return;
  const key = `${ref.type}:${ref.value}`;
  if (seen.has(key)) return;
  const next = new Set(seen).add(key);
  const structure: any = schedule.structure;
  switch (ref.type) {
    case 'PARTICIPANT':
      return ref.value;
    case 'TOURNAMENT_SLOT':
      return structure.slots.find(
        (s: any) => s.slotNumber === Number(ref.value) || s.id === ref.value,
      )?.participantId;
    case 'SEED': {
      const seed = structure.seeds.find(
        (s: any) => s.seedNumber === Number(ref.value),
      );
      return (
        seed?.participantId ||
        (seed?.slotNumber
          ? resolveReference(
              schedule,
              { type: 'TOURNAMENT_SLOT', value: String(seed.slotNumber) },
              next,
            )
          : undefined)
      );
    }
    case 'QUALIFIER_SEED':
      return structure.qualificationResolution?.status === 'RESOLVED'
        ? structure.qualificationResolution.seeds.find(
            (s: any) => s.seedNumber === Number(ref.value),
          )?.participantId
        : undefined;
    case 'GROUP_POSITION': {
      const result = /^(.*) #(\d+)$/.exec(ref.value);
      if (!result) return;
      return structure.qualificationResolution?.status === 'RESOLVED'
        ? structure.qualificationResolution.seeds.find(
            (s: any) =>
              s.groupName === result[1] &&
              s.groupPosition === Number(result[2]),
          )?.participantId
        : undefined;
    }
    case 'MATCH_WINNER':
    case 'MATCH_LOSER': {
      const match = structure.matches.find((m: any) => m.id === ref.value);
      if (!match) return;
      if (match.isAutoAdvance) {
        if (ref.type === 'MATCH_LOSER') return;
        return resolveReference(
          schedule,
          match.participant1Ref.type === 'BYE'
            ? match.participant2Ref
            : match.participant1Ref,
          next,
        );
      }
      if (
        match.status !== 'COMPLETED' ||
        !validScore(match.score1) ||
        !validScore(match.score2) ||
        match.score1 === match.score2
      )
        return;
      const first =
        match.score1 > match.score2 === (ref.type === 'MATCH_WINNER');
      return resolveReference(
        schedule,
        first ? match.participant1Ref : match.participant2Ref,
        next,
      );
    }
    case 'TIE_WINNER':
    case 'TIE_LOSER': {
      const legs = structure.matches
        .filter((m: any) => m.tieId === ref.value)
        .sort((a: any, b: any) => a.legNumber - b.legNumber);
      if (
        legs.length !== 2 ||
        legs.some(
          (m: any) =>
            m.status !== 'COMPLETED' ||
            !validScore(m.score1) ||
            !validScore(m.score2),
        )
      )
        return;
      const a = legs[0].score1 + legs[1].score2;
      const b = legs[0].score2 + legs[1].score1;
      if (a === b) return;
      return resolveReference(
        schedule,
        a > b === (ref.type === 'TIE_WINNER')
          ? legs[0].participant1Ref
          : legs[0].participant2Ref,
        next,
      );
    }
  }
}

export function refreshParticipants(schedule: TournamentSchedulePayload) {
  const names = new Map(
    schedule.structure.slots
      .filter((s) => s.participantId)
      .map((s) => [s.participantId, s.participantName]),
  );
  for (const m of schedule.structure.matches) {
    m.player1Id = resolveReference(schedule, m.participant1Ref);
    m.player2Id = resolveReference(schedule, m.participant2Ref);
    m.player1Name = m.player1Id
      ? names.get(m.player1Id) || m.player1Id
      : referenceLabel(m.participant1Ref);
    m.player2Name = m.player2Id
      ? names.get(m.player2Id) || m.player2Id
      : referenceLabel(m.participant2Ref);
  }
  for (const v of schedule.calendar || [])
    for (const s of v.screens)
      for (const d of s.days)
        for (const slot of d.timeslots) {
          const match = schedule.structure.matches.find(
            (m) =>
              m.id ===
              (slot.canonicalMatchId ||
                slot.game?.canonicalMatchId ||
                slot.game?.id),
          );
          if (match && slot.game)
            Object.assign(slot.game, {
              player1Id: match.player1Id || 'TBD',
              player2Id: match.player2Id || 'TBD',
              player1Name: match.player1Name,
              player2Name: match.player2Name,
              score1: match.score1,
              score2: match.score2,
              status: match.status,
            });
        }
}
function referenceLabel(ref: MatchParticipantRef) {
  if (ref.displayName) return ref.displayName;
  return ref.type === 'QUALIFIER_SEED'
    ? `Qualifier Seed #${ref.value}`
    : ref.type === 'GROUP_POSITION'
      ? ref.value
      : ref.type === 'MATCH_WINNER'
        ? `Winner of ${ref.value}`
        : ref.type === 'MATCH_LOSER'
          ? `Loser of ${ref.value}`
          : 'TBD';
}

type Row = {
  participantId: string;
  slotNumber: number;
  groupId: string;
  groupName: string;
  played: number;
  points: number;
  wins: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  fairPlayPenaltyPoints: number;
  tier?: number;
  groupPosition?: number;
  seedNumber?: number;
};
export function compareQualificationStats(a: Row, b: Row) {
  for (const field of [
    'points',
    'goalDifference',
    'goalsFor',
    'wins',
  ] as const) {
    const difference = b[field] * a.played - a[field] * b.played;
    if (difference) return difference;
  }
  return a.fairPlayPenaltyPoints - b.fairPlayPenaltyPoints;
}

/** Called only by result/draw commands. A resolved snapshot is never recomputed. */
export function reconcileQualification(
  schedule: TournamentSchedulePayload,
  isDouble: boolean,
) {
  const structure: any = schedule.structure;
  if (
    !structure.groups?.length ||
    structure.qualificationResolution?.status === 'RESOLVED'
  )
    return;
  const prior = structure.qualificationResolution;
  const draws: Record<string, string[]> = prior?.draws || {};
  const resolution: any = {
    rulesVersion: 'HYBRID_QUALIFICATION_V1',
    status: 'PENDING',
    qualifierCount: structure.groups.length * (structure.topQualifiers ?? 2),
    seeds: [],
    tieGroups: [],
    draws,
    drawAudit: prior?.drawAudit || [],
  };
  structure.qualificationResolution = resolution;
  const rows: Row[] = [];
  const ordered = (values: Row[], scope: string) => {
    const sorted = [...values].sort(compareQualificationStats);
    for (let i = 0; i < sorted.length; ) {
      let end = i + 1;
      while (
        end < sorted.length &&
        compareQualificationStats(sorted[i], sorted[end]) === 0
      )
        end++;
      const tied = sorted.slice(i, end);
      if (tied.length > 1) {
        // Bind a draw to the current evidence, so result changes invalidate stale draws.
        const evidence = tied
          .map((r) => [
            r.participantId,
            r.played,
            r.points,
            r.goalDifference,
            r.goalsFor,
            r.wins,
            r.fairPlayPenaltyPoints,
          ])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
        const id = `${scope}:${JSON.stringify(evidence)}`;
        const ids = tied.map((r) => r.participantId);
        const draw = draws[id];
        if (
          draw?.length === ids.length &&
          new Set(draw).size === ids.length &&
          draw.every((pid) => ids.includes(pid))
        )
          tied.sort(
            (a, b) =>
              draw.indexOf(a.participantId) - draw.indexOf(b.participantId),
          );
        else resolution.tieGroups.push({ id, participantIds: ids });
        sorted.splice(i, tied.length, ...tied);
      }
      i = end;
    }
    return sorted;
  };
  let allComplete = true;
  for (const group of structure.groups) {
    let groupComplete = true;
    const groupRows: Row[] = group.slotNumbers.map((slotNumber: number) => ({
      participantId: structure.slots.find(
        (s: any) => s.slotNumber === slotNumber,
      )?.participantId,
      slotNumber,
      groupId: group.id,
      groupName: group.name,
      played: 0,
      points: 0,
      wins: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      fairPlayPenaltyPoints:
        structure.slots.find((s: any) => s.slotNumber === slotNumber)
          ?.fairPlayPenaltyPoints ??
        group.standings?.find((r: any) => r.slotNumber === slotNumber)
          ?.fairPlayPenaltyPoints ??
        0,
    }));
    if (groupRows.some((r) => !r.participantId)) {
      allComplete = false;
      continue;
    }
    for (let i = 0; i < groupRows.length; i++)
      for (let j = i + 1; j < groupRows.length; j++) {
        const a = groupRows[i],
          b = groupRows[j];
        const pairings = structure.matches.filter(
          (m: any) =>
            m.bracketSection === 'GROUP' &&
            ((resolveReference(schedule, m.participant1Ref) ===
              a.participantId &&
              resolveReference(schedule, m.participant2Ref) ===
                b.participantId) ||
              (resolveReference(schedule, m.participant1Ref) ===
                b.participantId &&
                resolveReference(schedule, m.participant2Ref) ===
                  a.participantId)),
        );
        if (
          pairings.length !== (isDouble ? 2 : 1) ||
          pairings.some(
            (m: any) =>
              m.status !== 'COMPLETED' ||
              !validScore(m.score1) ||
              !validScore(m.score2),
          )
        )
          groupComplete = false;
        if (
          isDouble &&
          pairings.length === 2 &&
          pairings[0].participant1Ref.value ===
            pairings[1].participant1Ref.value
        )
          groupComplete = false;
        for (const m of pairings.filter(
          (m: any) =>
            m.status === 'COMPLETED' &&
            validScore(m.score1) &&
            validScore(m.score2),
        )) {
          const first =
            resolveReference(schedule, m.participant1Ref) === a.participantId;
          const x = first ? m.score1 : m.score2,
            y = first ? m.score2 : m.score1;
          a.played++;
          b.played++;
          a.goalsFor += x;
          a.goalsAgainst += y;
          b.goalsFor += y;
          b.goalsAgainst += x;
          if (x === y) {
            a.points++;
            b.points++;
          } else if (x > y) {
            a.points += 3;
            a.wins++;
          } else {
            b.points += 3;
            b.wins++;
          }
        }
      }
    groupRows.forEach((r) => (r.goalDifference = r.goalsFor - r.goalsAgainst));
    group.standings = groupRows.map((r) => ({
      ...r,
      losses: r.played - r.wins - (r.points - r.wins * 3),
      draws: r.points - r.wins * 3,
    }));
    if (!groupComplete) {
      allComplete = false;
      continue;
    }
    const ranked = ordered(groupRows, `group:${group.id}`);
    for (let i = 0; i < ranked.length; i++)
      Object.assign(ranked[i], { groupPosition: i + 1, tier: i + 1 });
    rows.push(
      ...ranked.filter(
        (r) => r.groupPosition! <= (structure.topQualifiers ?? 2),
      ),
    );
  }
  if (!allComplete) {
    resolution.status = 'PENDING';
    resolution.tieGroups = [];
    return;
  }
  // Do not assign group positions until within-group ties have been settled.
  if (resolution.tieGroups.length) {
    resolution.status = 'DRAW_REQUIRED';
    return;
  }
  const seeds: Row[] = [];
  for (let tier = 1; tier <= (structure.topQualifiers ?? 2); tier++)
    seeds.push(
      ...ordered(
        rows.filter((r) => r.tier === tier),
        `tier:${tier}`,
      ),
    );
  resolution.status = resolution.tieGroups.length
    ? 'DRAW_REQUIRED'
    : 'RESOLVED';
  resolution.seeds =
    resolution.status === 'RESOLVED'
      ? seeds.map((r, i) => ({ ...r, seedNumber: i + 1 }))
      : [];
  const n = resolution.qualifierCount,
    target = largestPowerOfTwoNotExceeding(n);
  Object.assign(resolution, {
    targetKnockoutSize: target,
    directAdvanceCount: 2 * target - n,
    preliminaryCount: n - target,
  });
}

export function applyQualificationDraw(
  schedule: TournamentSchedulePayload,
  tieGroupId: string,
  participantIds: string[],
  isDouble: boolean,
  actorId: string,
) {
  const resolution: any = (schedule.structure as any).qualificationResolution;
  const group =
    resolution?.status === 'DRAW_REQUIRED' &&
    resolution.tieGroups.find((g: any) => g.id === tieGroupId);
  if (
    !group ||
    !Array.isArray(participantIds) ||
    participantIds.length !== group.participantIds.length ||
    new Set(participantIds).size !== participantIds.length ||
    participantIds.some((id) => !group.participantIds.includes(id))
  )
    throw new BadRequestException('STALE_OR_INVALID_QUALIFICATION_DRAW');
  resolution.draws[tieGroupId] = [...participantIds];
  resolution.drawAudit = [
    ...(resolution.drawAudit || []),
    {
      tieGroupId,
      participantIds,
      actorId,
      resolvedAt: new Date().toISOString(),
    },
  ];
  const audit = resolution.drawAudit;
  reconcileQualification(schedule, isDouble);
  (schedule.structure as any).qualificationResolution.drawAudit = audit;
  refreshParticipants(schedule);
}

export function capacitySummary(schedule: TournamentSchedulePayload) {
  const matches = schedule.structure.matches;
  const links = new Set<string>();
  let total = 0,
    occupied = 0;
  for (const v of schedule.calendar || [])
    for (const s of v.screens)
      for (const d of s.days)
        for (const slot of d.timeslots) {
          total++;
          const id =
            slot.canonicalMatchId ||
            slot.game?.canonicalMatchId ||
            slot.game?.id;
          if (id || slot.game) occupied++;
          if (id) links.add(id);
        }
  const pending = matches.filter(
    (m) => active(m) && !terminal(m) && !links.has(m.id),
  ).length;
  const inactive = matches.filter(
    (m) =>
      real(m) &&
      m.conditional &&
      m.isSchedulable === false &&
      !terminal(m) &&
      !links.has(m.id),
  ).length;
  const free = Math.max(0, total - occupied);
  const guaranteedDeficit = Math.max(0, pending - free);
  const conditionalReserveDeficit = Math.max(
    0,
    inactive - Math.max(0, free - pending),
  );
  const summary = summarizeTournamentMatches(matches);
  let conflicts = 0;
  const allocated = matches.filter((m) => links.has(m.id) && m.date && m.time);
  const duration =
    (schedule.capacity as any).matchDuration ??
    schedule.capacity.matchTimeMinutes;
  for (let i = 0; i < allocated.length; i++)
    for (let j = i + 1; j < allocated.length; j++) {
      const a = allocated[i],
        b = allocated[j];
      if (a.date !== b.date) continue;
      const startA = timeStringToMinutes(a.time!),
        startB = timeStringToMinutes(b.time!);
      if (
        [a.player1Id, a.player2Id]
          .filter(Boolean)
          .some((p) => p === b.player1Id || p === b.player2Id) &&
        startA < startB + duration &&
        startB < startA + duration
      )
        conflicts++;
    }
  return {
    status: guaranteedDeficit
      ? 'GUARANTEED_SHORTFALL'
      : conditionalReserveDeficit
        ? 'CONDITIONAL_RESERVE_SHORTFALL'
        : 'SUFFICIENT',
    guaranteedMatches: summary.guaranteedMatchCount,
    conditionalMatches: summary.conditionalMatchCount,
    maximumPossibleMatches: summary.maximumPossibleMatchCount,
    allocatedMatches: matches.filter((m) => links.has(m.id)).length,
    pendingGuaranteedMatches: pending,
    inactiveConditionalReserveMatches: inactive,
    totalPhysicalSlots: total,
    occupiedPhysicalSlots: occupied,
    availablePhysicalSlots: free,
    guaranteedDeficit,
    conditionalReserveDeficit,
    surplusAfterMaximum: Math.max(0, free - pending - inactive),
    baselinePlayingDays: schedule.capacity.baselineDays,
    conditionalReservePlayingDays: schedule.capacity.reserveDays,
    bufferPlayingDays: schedule.capacity.bufferDays,
    totalGeneratedPlayingDays: new Set(
      (schedule.calendar || []).flatMap((v) =>
        v.screens.flatMap((s) => s.days.map((d) => d.date)),
      ),
    ).size,
    playerConflictCount: conflicts,
  };
}

/** Extend complete empty dates. Never replace existing dates, matches or allocations. */
export function ensureCapacity(
  schedule: TournamentSchedulePayload,
  config: any,
) {
  const before = capacitySummary(schedule);
  if (!before.guaranteedDeficit && !before.conditionalReserveDeficit)
    return {
      success: true,
      slotsAdded: 0,
      playingDaysAdded: 0,
      guaranteedDeficitBefore: 0,
      guaranteedDeficitAfter: 0,
      conditionalReserveDeficitBefore: 0,
      conditionalReserveDeficitAfter: 0,
    };
  const venues = (config.venues || []).map((v: any) => ({
    venueId: v.venueId,
    name: v.name,
    screens: v.screens.map((s: any) => ({
      screenId: s.screenId,
      screenName: s.screenName,
    })),
  }));
  const capacity = calculateCapacity({
    ...config,
    slotDuration: config.matchDuration,
    venues,
    totalMatches: before.guaranteedDeficit + before.conditionalReserveDeficit,
  });
  const dates = (schedule.calendar || [])
    .flatMap((v) => v.screens.flatMap((s) => s.days.map((d) => d.date)))
    .sort();
  const next = new Date(
    `${dates.at(-1) || String(config.startDate instanceof Date ? config.startDate.toISOString() : config.startDate).slice(0, 10)}T00:00:00Z`,
  );
  if (dates.length) next.setUTCDate(next.getUTCDate() + 1);
  const eventDates = generatePlayingDates(
    next,
    capacity.baselineDays,
    config.frequencyStatus,
    config.frequencyArray,
  );
  const times = calculateDayTimeslots(
    config.dailyStart,
    config.dailyEnd,
    config.matchDuration,
    config.turnoverDuration,
    config.lunchBreakTime,
    config.lunchDuration,
  );
  const extension = buildEmptyScheduleGrid(venues, eventDates, times);
  for (const v of extension) {
    let target = schedule.calendar.find((old) => old.venueId === v.venueId);
    if (!target) {
      target = { ...v, screens: [] };
      schedule.calendar.push(target);
    }
    for (const screen of v.screens) {
      const existing = target.screens.find(
        (s) => s.screenId === screen.screenId,
      );
      if (existing) existing.days.push(...screen.days);
      else target.screens.push(screen);
    }
  }
  schedule.capacity.eventDates = [...new Set([...dates, ...eventDates])];
  schedule.capacity.totalPlayingDaysNeeded =
    schedule.capacity.eventDates.length;
  const after = capacitySummary(schedule);
  return {
    success: !after.guaranteedDeficit && !after.conditionalReserveDeficit,
    slotsAdded: after.totalPhysicalSlots - before.totalPhysicalSlots,
    playingDaysAdded: eventDates.length,
    guaranteedDeficitBefore: before.guaranteedDeficit,
    guaranteedDeficitAfter: after.guaranteedDeficit,
    conditionalReserveDeficitBefore: before.conditionalReserveDeficit,
    conditionalReserveDeficitAfter: after.conditionalReserveDeficit,
  };
}

/** Rebuild empty capacity only after proving every occupied allocation survives. */
export function reconcileCalendarSettings(
  schedule: TournamentSchedulePayload,
  config: any,
) {
  const venues = (config.venues || []).map((v: any) => ({
    venueId: v.venueId,
    name: v.name,
    screens: v.screens.map((s: any) => ({
      screenId: s.screenId,
      screenName: s.screenName,
    })),
  }));
  const counts = summarizeTournamentMatches(schedule.structure.matches);
  const capacity = calculateCapacity({
    ...config,
    slotDuration: config.matchDuration,
    venues,
    totalMatches: counts.guaranteedMatchCount,
    conditionalMatches: counts.conditionalMatchCount,
    bufferDays: config.buffer,
  });
  Object.assign(capacity, {
    matchDuration: config.matchDuration,
    turnoverDuration: config.turnoverDuration,
  });
  const times = calculateDayTimeslots(
    config.dailyStart,
    config.dailyEnd,
    config.matchDuration,
    config.turnoverDuration,
    config.lunchBreakTime,
    config.lunchDuration,
  );
  const dates = generatePlayingDates(
    config.startDate,
    capacity.totalPlayingDaysNeeded,
    config.frequencyStatus,
    config.frequencyArray,
  );
  const calendar = buildEmptyScheduleGrid(venues, dates, times);
  for (const v of calendar)
    for (const screen of v.screens)
      for (const day of screen.days) {
        const oldDay = schedule.calendar
          .find((old) => old.venueId === v.venueId)
          ?.screens.find((old) => old.screenId === screen.screenId)
          ?.days.find((old) => old.date === day.date);
        if (oldDay?.schedulingPolicy)
          day.schedulingPolicy = oldDay.schedulingPolicy;
      }
  const start = (
    config.startDate instanceof Date
      ? config.startDate.toISOString()
      : String(config.startDate)
  ).slice(0, 10);
  for (const venue of schedule.calendar || [])
    for (const screen of venue.screens)
      for (const day of screen.days) {
        const occupied = day.timeslots.filter(
          (slot) => slot.canonicalMatchId || slot.game,
        );
        if (!occupied.length) continue;
        const targetScreen = calendar
          .find((v) => v.venueId === venue.venueId)
          ?.screens.find((s) => s.screenId === screen.screenId);
        if (!targetScreen)
          throw new BadRequestException(
            'SCREEN_UNAVAILABLE: settings would remove an occupied screen',
          );
        if (day.date < start)
          throw new BadRequestException(
            'BEFORE_START_DATE: settings would invalidate an allocation',
          );
        if (
          generatePlayingDates(
            day.date,
            1,
            config.frequencyStatus,
            config.frequencyArray,
          )[0] !== day.date
        )
          throw new BadRequestException(
            'DATE_NOT_PERMITTED: occupied date is not a playing weekday',
          );
        if (
          occupied.some((slot) => !times.includes(slot.time)) ||
          ((schedule.capacity as any).matchDuration !== undefined &&
            (schedule.capacity as any).matchDuration !== config.matchDuration)
        )
          throw new BadRequestException(
            'SLOT_WINDOW_CHANGED: settings would change an occupied match interval',
          );
        let targetDay = targetScreen.days.find((d) => d.date === day.date);
        if (!targetDay) {
          targetDay = {
            date: day.date,
            timeslots: times.map((time) => ({ time, game: null })),
            schedulingPolicy: day.schedulingPolicy,
          };
          targetScreen.days.push(targetDay);
        }
        targetDay.schedulingPolicy = day.schedulingPolicy;
        for (const slot of occupied)
          Object.assign(
            targetDay.timeslots.find((s) => s.time === slot.time)!,
            slot,
          );
      }
  schedule.calendar = calendar;
  schedule.capacity = {
    ...capacity,
    eventDates: [
      ...new Set(
        calendar.flatMap((v) =>
          v.screens.flatMap((s) => s.days.map((d) => d.date)),
        ),
      ),
    ].sort(),
  };
  ensureCapacity(schedule, config);
  refreshParticipants(schedule);
}

export function allocatePending(
  schedule: TournamentSchedulePayload,
  mode: string,
  participants: any[],
) {
  const pending: Array<{ matchId: string; reason: string }> = [];
  const allocated: string[] = [];
  let current = schedule;
  const home = new Map(participants.map((p) => [p.playerId, p.homeVenueId]));
  const candidates = current.structure.matches.filter(
    (m) => !terminal(m) && active(m) && !m.date,
  );
  if (mode === 'AUTO_RANDOM') candidates.sort(() => Math.random() - 0.5);
  for (const original of candidates) {
    const m = current.structure.matches.find(
      (match) => match.id === original.id,
    )!;
    if (mode === 'AUTO_HOME_VENUE' && (!m.player1Id || !m.player2Id)) {
      pending.push({ matchId: m.id, reason: 'PARTICIPANTS_UNRESOLVED' });
      continue;
    }
    const slots = current.calendar.flatMap((v) =>
      v.screens.flatMap((s) =>
        s.days.flatMap((d) =>
          d.timeslots
            .filter((slot) => !slot.game && !slot.canonicalMatchId)
            .map((slot) => ({
              venueId: v.venueId,
              screenId: s.screenId,
              date: d.date,
              time: slot.time,
            })),
        ),
      ),
    );
    if (mode === 'AUTO_RANDOM') slots.sort(() => Math.random() - 0.5);
    else
      slots.sort(
        (a, b) =>
          Number(
            [home.get(m.player1Id), home.get(m.player2Id)].includes(b.venueId),
          ) -
          Number(
            [home.get(m.player1Id), home.get(m.player2Id)].includes(a.venueId),
          ),
      );
    let placed = false;
    for (const slot of slots) {
      try {
        current = allocateMatch(
          current,
          m.id,
          slot.venueId,
          slot.screenId,
          slot.date,
          slot.time,
        ).updatedSchedule;
        allocated.push(m.id);
        placed = true;
        break;
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
      }
    }
    if (!placed) pending.push({ matchId: m.id, reason: 'NO_VALID_CAPACITY' });
  }
  return { schedule: current, allocated, pending };
}

export function doubleEliminationPlacements(
  schedule: TournamentSchedulePayload,
) {
  const refs = resolveDoubleEliminationPlacementRefs(
    schedule.structure.matches,
  );
  return (['first', 'second', 'third', 'fourth'] as const).map((key, index) => {
    const participantId = refs[key]
      ? resolveReference(schedule, refs[key])
      : undefined;
    return {
      position: index + 1,
      status:
        index >= schedule.structure.slots.length
          ? 'NOT_APPLICABLE'
          : participantId
            ? 'RESOLVED'
            : 'PENDING',
      participantId: participantId ?? null,
    };
  });
}

/** Infer omitted historical flags from existing nodes without rewriting the graph. */
export function structureFlags(structure: any) {
  const matches: TournamentMatchEntity[] = structure?.matches || [];
  return {
    thirdPlacePlayoffEnabled:
      structure?.thirdPlacePlayoffEnabled ??
      matches.some(
        (m) =>
          !m.conditional &&
          m.bracketSection !== 'LOSERS' &&
          ['MATCH_LOSER', 'TIE_LOSER'].includes(m.participant1Ref?.type) &&
          ['MATCH_LOSER', 'TIE_LOSER'].includes(m.participant2Ref?.type),
      ),
    hasGrandFinalReset:
      structure?.hasGrandFinalReset ??
      matches.some(
        (m) => m.conditional && m.conditionType === 'GRAND_FINAL_RESET',
      ),
  };
}
