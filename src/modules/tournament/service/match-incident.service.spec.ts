import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MatchIncidentService } from './match-incident.service';

describe('Match incident lifecycle', () => {
  let prisma: any;
  let gateway: any;
  let service: MatchIncidentService;
  let tournament: any;
  let match: any;
  let incident: any;
  const employee = { userId: 'employee-1', role: 'EMPLOYEE' };
  const manager = { userId: 'manager-1', role: 'MANAGER' };

  beforeEach(() => {
    match = {
      id: 'm1',
      player1Id: 'p1',
      player2Id: 'p2',
      status: 'IN_PROGRESS',
      score1: 0,
      score2: 0,
      checkIns: [{ playerId: 'p1' }, { playerId: 'p2' }],
    };
    tournament = {
      tournamentId: 't1',
      name: 'Cup',
      version: 1,
      schedule: { structure: { matches: [match] }, matches: [match] },
    };
    incident = {
      disputeId: 'd1',
      tournamentId: 't1',
      matchId: 'm1',
      reason: 'Hardware failure',
      notes: 'Controller disconnected',
      reportedBy: employee.userId,
      status: 'UNDER_REVIEW',
      version: 1,
      createdAt: new Date(),
    };
    prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ name: 'Operator' }),
      },
      admin: { findFirst: jest.fn().mockResolvedValue({ name: 'Reviewer' }) },
      tournament: {
        findUnique: jest.fn().mockResolvedValue(tournament),
        findMany: jest.fn().mockResolvedValue([tournament]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      tournamentStaffAssignment: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ employeeId: employee.userId }),
      },
      matchDispute: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(incident),
        findUnique: jest.fn().mockResolvedValue(incident),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ ...incident, status: 'RESOLVED', version: 2 }),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    prisma.$transaction = jest.fn((callback) => callback(prisma));
    gateway = { publish: jest.fn() };
    service = new MatchIncidentService(prisma, gateway);
  });

  it('persists the report and locks the match before notifying reviewers', async () => {
    await service.create(
      't1',
      'm1',
      { reason: 'Hardware failure', notes: 'Controller disconnected' },
      employee,
    );
    expect(prisma.matchDispute.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        notes: 'Controller disconnected',
        reportedBy: employee.userId,
      }),
    });
    expect(match.status).toBe('UNDER_REVIEW');
    expect(match.activeDisputeId).toBe('d1');
    expect(gateway.publish).toHaveBeenCalledWith(
      'incident:created',
      expect.objectContaining({ id: 'd1' }),
      expect.arrayContaining([employee.userId]),
    );
    expect(
      prisma.tournament.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(gateway.publish.mock.invocationCallOrder[0]);
  });

  it('rejects duplicate reports without creating another incident or socket notification', async () => {
    prisma.matchDispute.findFirst.mockResolvedValue(incident);
    await expect(
      service.create('t1', 'm1', { reason: 'Again' }, employee),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.matchDispute.create).not.toHaveBeenCalled();
    expect(gateway.publish).not.toHaveBeenCalled();
  });

  it('does not report success or broadcast if the schedule version changed', async () => {
    prisma.tournament.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.create('t1', 'm1', { reason: 'Hardware failure' }, employee),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(gateway.publish).not.toHaveBeenCalled();
  });

  it('resolution waits for Start Again even when both checked-in players have numeric scores', async () => {
    match.status = 'UNDER_REVIEW';
    await service.resolve(
      'd1',
      {
        resolution: 'RESOLVED',
        reason: 'Controller replaced',
        expectedVersion: 1,
      },
      manager,
    );
    expect(match.status).toBe('PLAYERS_READY');
    expect(match.resumeRequired).toBe(true);
    expect(match.score1).toBe(0);
    expect(match.score2).toBe(0);
    expect(prisma.matchDispute.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resolvedBy: manager.userId }),
      }),
    );
  });

  it('prevents employees from resolving incidents and stale reviewers from overwriting a resolution', async () => {
    await expect(
      service.resolve('d1', { resolution: 'RESOLVED' }, employee),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.resolve(
        'd1',
        { resolution: 'RESOLVED', expectedVersion: 2 },
        manager,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.matchDispute.updateMany).not.toHaveBeenCalled();
  });

  it('restarts a cleared match only after both check-ins remain valid', async () => {
    match.status = 'PLAYERS_READY';
    match.resumeRequired = true;
    const resumed = await service.resume('t1', 'm1', employee);
    expect(resumed.status).toBe('IN_PROGRESS');
    expect(resumed.resumeRequired).toBe(false);
    expect(gateway.publish).toHaveBeenCalledWith(
      'match:updated',
      expect.objectContaining({ status: 'IN_PROGRESS' }),
      [employee.userId],
    );
  });

  it('blocks restarting while an incident remains open or a participant is absent', async () => {
    match.status = 'PLAYERS_READY';
    match.resumeRequired = true;
    prisma.matchDispute.count.mockResolvedValueOnce(1);
    await expect(service.resume('t1', 'm1', employee)).rejects.toBeInstanceOf(
      ConflictException,
    );
    match.checkIns = [{ playerId: 'p1' }];
    await expect(service.resume('t1', 'm1', employee)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.tournament.updateMany).not.toHaveBeenCalled();
  });

  it('blocks other employees from operating the match', async () => {
    await expect(
      service.create(
        't1',
        'm1',
        { reason: 'Issue' },
        { userId: 'other-employee', role: 'EMPLOYEE' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.matchDispute.create).not.toHaveBeenCalled();
  });
});
