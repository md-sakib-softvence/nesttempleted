import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { MatchIncidentGateway } from '../gateway/match-incident.gateway';
import { CreateMatchDisputeDto } from '../dto/tournament/match-dispute.dto';
import { UpdateMatchDisputeDto } from '../dto/tournament/update-dispute.dto';

export type MatchOperator = { userId: string; role: string };
const ACTIVE_STATUSES = ['OPEN', 'UNDER_REVIEW'] as const;

@Injectable()
export class MatchIncidentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MatchIncidentGateway,
  ) {}

  private async operator(actor: MatchOperator) {
    const role = String(actor?.role || '').toUpperCase();
    if (
      !actor?.userId ||
      !['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'EMPLOYEE'].includes(role)
    ) {
      throw new ForbiddenException(
        'An active match operator account is required',
      );
    }
    const account = ['ADMIN', 'SUPER_ADMIN'].includes(role)
      ? await this.prisma.admin.findFirst({
          where: {
            adminId: actor.userId,
            isDeleted: false,
            status: 'ACTIVE',
            role,
          } as any,
        })
      : await this.prisma.employee.findFirst({
          where: {
            employeeId: actor.userId,
            isDeleted: false,
            state: 'ACTIVE',
            role,
          } as any,
        });
    if (!account)
      throw new ForbiddenException('The match operator account is inactive');
    return { ...actor, role, name: account.name };
  }

  private async assertAssigned(
    db: Prisma.TransactionClient,
    tournamentId: string,
    matchId: string,
    actor: MatchOperator,
  ) {
    if (String(actor.role).toUpperCase() !== 'EMPLOYEE') return;
    const assignment = await db.tournamentStaffAssignment.findUnique({
      where: { tournamentId_matchId: { tournamentId, matchId } },
    });
    if (assignment?.employeeId !== actor.userId) {
      throw new ForbiddenException(
        'You can only operate matches assigned to your employee account',
      );
    }
  }

  private context(tournament: any, matchId: string) {
    if (!tournament || tournament.isDeleted)
      throw new NotFoundException('Tournament not found');
    const schedule = (tournament.schedule as any) || {};
    const matches: any[] =
      schedule.structure?.matches || schedule.matches || [];
    const match = matches.find(
      (item) => item.id === matchId || item.canonicalMatchId === matchId,
    );
    if (!match)
      throw new NotFoundException('Match not found in this tournament');
    return { schedule, matches, match };
  }

  private async saveSchedule(
    db: Prisma.TransactionClient,
    tournament: any,
    schedule: any,
    matches: any[],
    match: any,
  ) {
    if (schedule.structure) schedule.structure.matches = matches;
    if (Array.isArray(schedule.matches) || !schedule.structure)
      schedule.matches = matches;
    const venues = schedule.calendar?.venues || schedule.venueSchedules || [];
    for (const venue of Array.isArray(venues) ? venues : []) {
      for (const screen of venue.screens || [])
        for (const day of screen.days || []) {
          for (const slot of day.timeslots || []) {
            if (
              slot.game &&
              (slot.game.id === match.id ||
                slot.game.canonicalMatchId === match.id)
            ) {
              Object.assign(slot.game, {
                status: match.status,
                resumeRequired: match.resumeRequired,
                activeDisputeId: match.activeDisputeId,
                incidentResolution: match.incidentResolution || null,
              });
            }
          }
        }
    }
    const saved = await db.tournament.updateMany({
      where: {
        tournamentId: tournament.tournamentId,
        version: tournament.version,
      },
      data: { schedule, version: { increment: 1 } },
    });
    if (saved.count !== 1)
      throw new ConflictException(
        'The match changed. Refresh before trying again.',
      );
  }

  private async targets(
    tournamentId: string,
    matchId: string,
    reporterId?: string | null,
  ) {
    const assignment = await this.prisma.tournamentStaffAssignment.findUnique({
      where: { tournamentId_matchId: { tournamentId, matchId } },
      select: { employeeId: true },
    });
    return [reporterId, assignment?.employeeId].filter((id): id is string =>
      Boolean(id),
    );
  }

  private async hydrate(rows: any[]) {
    const ids = [
      ...new Set(rows.map((row) => row.tournamentId).filter(Boolean)),
    ] as string[];
    const tournaments = await this.prisma.tournament.findMany({
      where: { tournamentId: { in: ids } },
      select: { tournamentId: true, name: true, schedule: true },
    });
    return rows.map((row) => {
      const tournament = tournaments.find(
        (item) => item.tournamentId === row.tournamentId,
      );
      const schedule = tournament?.schedule as any;
      const match = (
        schedule?.structure?.matches ||
        schedule?.matches ||
        []
      ).find((item: any) => item.id === row.matchId);
      return {
        id: row.disputeId,
        tournamentId: row.tournamentId,
        tournamentName: tournament?.name || 'Tournament',
        matchId: row.matchId,
        reason: row.reason,
        notes: row.notes,
        reportedBy: row.reportedByName || row.reportedBy || 'Tournament staff',
        reportedById: row.reportedBy,
        reportedByRole: row.reportedByRole,
        timestamp: row.createdAt,
        status: row.status,
        resolutionNotes: row.resolution,
        resolvedAt: row.resolvedAt,
        resolvedBy: row.resolvedBy,
        version: row.version,
        player1Name: match?.player1Name || match?.player1Id || 'Player 1',
        player2Name: match?.player2Name || match?.player2Id || 'Player 2',
        matchStatus: match?.status,
        resumeRequired: Boolean(match?.resumeRequired),
      };
    });
  }

  async list(actor: MatchOperator, tournamentId?: string) {
    const operator = await this.operator(actor);
    if (operator.role === 'EMPLOYEE')
      throw new ForbiddenException(
        'Only managers and admins can review incidents',
      );
    const rows = await this.prisma.matchDispute.findMany({
      where: tournamentId ? { tournamentId } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return this.hydrate(rows);
  }

  async detail(disputeId: string, actor: MatchOperator) {
    const operator = await this.operator(actor);
    if (operator.role === 'EMPLOYEE')
      throw new ForbiddenException(
        'Only managers and admins can review incidents',
      );
    const row = await this.prisma.matchDispute.findUnique({
      where: { disputeId },
    });
    if (!row) throw new NotFoundException('Incident not found');
    return (await this.hydrate([row]))[0];
  }

  async create(
    tournamentId: string | undefined,
    matchId: string,
    dto: CreateMatchDisputeDto,
    actor: MatchOperator,
  ) {
    const operator = await this.operator(actor);
    if (!dto.reason?.trim())
      throw new BadRequestException('An incident reason is required');
    // Legacy match routes lack tournament scope; reject ambiguous IDs instead of choosing a tournament.
    if (!tournamentId) {
      const tournaments = await this.prisma.tournament.findMany({
        where: { isDeleted: false, schedule: { not: Prisma.JsonNull } },
      });
      const candidates = tournaments.filter((item) => {
        const schedule = item.schedule as any;
        return (schedule?.structure?.matches || schedule?.matches || []).some(
          (match: any) =>
            match.id === matchId || match.canonicalMatchId === matchId,
        );
      });
      if (candidates.length !== 1)
        throw new BadRequestException(
          'Specify the tournament when reporting this match',
        );
      tournamentId = candidates[0].tournamentId;
    }
    const id = tournamentId;
    const dispute = await this.prisma.$transaction(async (db) => {
      const tournament = await db.tournament.findUnique({
        where: { tournamentId: id },
      });
      const { schedule, matches, match } = this.context(tournament, matchId);
      await this.assertAssigned(db, id, match.id, operator);
      if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(match.status))
        throw new ConflictException(
          'This match can no longer accept an incident',
        );
      if (
        dto.expectedVersion !== undefined &&
        dto.expectedVersion !== (match.version || 1)
      )
        throw new ConflictException(
          'The match changed. Refresh and try again.',
        );
      const active = await db.matchDispute.findFirst({
        where: {
          tournamentId: id,
          matchId: match.id,
          status: { in: [...ACTIVE_STATUSES] },
        },
      });
      if (active)
        throw new ConflictException(
          'This match already has an active incident under review',
        );
      const row = await db.matchDispute.create({
        data: {
          tournamentId: id,
          matchId: match.id,
          reason: dto.reason.trim(),
          notes: dto.notes?.trim() || null,
          reportedBy: operator.userId,
          reportedByRole: operator.role,
          reportedByName: operator.name,
          status: 'UNDER_REVIEW',
        },
      });
      match.status = 'UNDER_REVIEW';
      match.activeDisputeId = row.disputeId;
      match.resumeRequired = false;
      match.version = (match.version || 1) + 1;
      await this.saveSchedule(db, tournament, schedule, matches, match);
      return row;
    });
    const incident = (await this.hydrate([dispute]))[0];
    this.gateway.publish(
      'incident:created',
      incident,
      await this.targets(id, dispute.matchId, operator.userId),
    );
    return incident;
  }

  async resolve(
    disputeId: string,
    dto: UpdateMatchDisputeDto,
    actor: MatchOperator,
  ) {
    const operator = await this.operator(actor);
    if (operator.role === 'EMPLOYEE')
      throw new ForbiddenException(
        'Only managers and admins can resolve incidents',
      );
    if (!['RESOLVED', 'REJECTED', 'UNDER_REVIEW'].includes(dto.resolution))
      throw new BadRequestException('Invalid incident review status');
    const dispute = await this.prisma.$transaction(async (db) => {
      const current = await db.matchDispute.findUnique({
        where: { disputeId },
      });
      if (!current) throw new NotFoundException('Incident not found');
      if (!ACTIVE_STATUSES.includes(current.status as any))
        throw new ConflictException('This incident has already been reviewed');
      if (
        dto.expectedVersion !== undefined &&
        dto.expectedVersion !== current.version
      )
        throw new ConflictException(
          'Another reviewer updated this incident. Refresh before resolving it.',
        );
      if (!current.tournamentId)
        throw new BadRequestException('Incident has no linked tournament');
      const tournament = await db.tournament.findUnique({
        where: { tournamentId: current.tournamentId },
      });
      const { schedule, matches, match } = this.context(
        tournament,
        current.matchId,
      );
      const terminal = dto.resolution !== 'UNDER_REVIEW';
      const saved = await db.matchDispute.updateMany({
        where: { disputeId, version: current.version },
        data: {
          status: dto.resolution,
          resolution: dto.reason?.trim() || null,
          resolvedAt: terminal ? new Date() : null,
          resolvedBy: operator.userId,
          version: { increment: 1 },
        },
      });
      if (saved.count !== 1)
        throw new ConflictException(
          'Another reviewer updated this incident. Refresh before resolving it.',
        );
      if (terminal) {
        const active = await db.matchDispute.count({
          where: {
            tournamentId: current.tournamentId,
            matchId: match.id,
            status: { in: [...ACTIVE_STATUSES] },
          },
        });
        if (active === 0) {
          const checkedIn = (playerId: string) =>
            (match.checkIns || []).some(
              (entry: any) => entry.playerId === playerId,
            );
          match.status =
            checkedIn(match.player1Id) && checkedIn(match.player2Id)
              ? 'PLAYERS_READY'
              : 'SCHEDULED';
          match.resumeRequired = true;
          match.activeDisputeId = null;
          match.incidentResolution = {
            disputeId,
            notes: dto.reason?.trim() || 'Incident reviewed and cleared.',
            resolvedAt: new Date().toISOString(),
            resolvedBy: operator.name,
          };
        }
      }
      match.version = (match.version || 1) + 1;
      await this.saveSchedule(db, tournament, schedule, matches, match);
      return db.matchDispute.findUniqueOrThrow({ where: { disputeId } });
    });
    const incident = (await this.hydrate([dispute]))[0];
    this.gateway.publish(
      'incident:updated',
      incident,
      await this.targets(
        dispute.tournamentId!,
        dispute.matchId,
        dispute.reportedBy,
      ),
    );
    return incident;
  }

  async resume(tournamentId: string, matchId: string, actor: MatchOperator) {
    const operator = await this.operator(actor);
    const match = await this.prisma.$transaction(async (db) => {
      const tournament = await db.tournament.findUnique({
        where: { tournamentId },
      });
      const { schedule, matches, match } = this.context(tournament, matchId);
      await this.assertAssigned(db, tournamentId, match.id, operator);
      if (
        !match.resumeRequired ||
        !['PLAYERS_READY', 'SCHEDULED'].includes(match.status)
      )
        throw new ConflictException('This match is not waiting to restart');
      const active = await db.matchDispute.count({
        where: {
          tournamentId,
          matchId: match.id,
          status: { in: [...ACTIVE_STATUSES] },
        },
      });
      if (active)
        throw new ConflictException(
          'The match still has an unresolved incident',
        );
      const bothCheckedIn = [match.player1Id, match.player2Id].every((id) =>
        (match.checkIns || []).some((entry: any) => entry.playerId === id),
      );
      if (!bothCheckedIn)
        throw new ConflictException(
          'Check in both players before restarting the match',
        );
      match.status = 'IN_PROGRESS';
      match.resumeRequired = false;
      match.resumedAt = new Date().toISOString();
      match.version = (match.version || 1) + 1;
      await this.saveSchedule(db, tournament, schedule, matches, match);
      return match;
    });
    await this.publishMatchUpdate(tournamentId, match.id, match.status);
    return match;
  }

  async publishMatchUpdate(
    tournamentId: string,
    matchId: string,
    status: string,
  ) {
    this.gateway.publish(
      'match:updated',
      { tournamentId, matchId, status },
      await this.targets(tournamentId, matchId),
    );
  }
}
