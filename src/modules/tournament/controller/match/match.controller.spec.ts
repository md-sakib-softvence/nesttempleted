import { Test, TestingModule } from '@nestjs/testing';
import {
  AdminMatchController,
  AdminDisputeController,
} from './match.controller';
import { TournamentService } from '../../service/tournament.service';
import { DisputeStatus } from '@prisma/client';

describe('AdminMatchController & DisputeController (Unit & Success Message Tests)', () => {
  let matchController: AdminMatchController;
  let disputeController: AdminDisputeController;
  let tournamentService: any;

  beforeEach(async () => {
    tournamentService = {
      updateMatchScore: jest.fn().mockResolvedValue({
        match: { id: 'm1', score1: 3, score2: 1, status: 'COMPLETED' },
      }),
      correctMatchScore: jest.fn().mockResolvedValue({
        match: { id: 'm1', score1: 2, score2: 1, status: 'COMPLETED' },
        auditEventId: 'audit-001',
      }),
      disputeMatch: jest.fn().mockResolvedValue({
        matchId: 'm1',
        status: 'UNDER_REVIEW',
        disputeId: 'disp-01',
      }),
      allocateTournamentMatch: jest.fn().mockResolvedValue({
        allocation: { id: 'alloc-1' },
      }),
      unallocateTournamentMatch: jest.fn().mockResolvedValue({
        unallocatedMatchId: 'm1',
      }),
      resolveMatchDispute: jest.fn().mockResolvedValue({
        disputeId: 'disp-01',
        status: DisputeStatus.RESOLVED,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminMatchController, AdminDisputeController],
      providers: [{ provide: TournamentService, useValue: tournamentService }],
    }).compile();

    matchController = module.get<AdminMatchController>(AdminMatchController);
    disputeController = module.get<AdminDisputeController>(
      AdminDisputeController,
    );
  });

  it('updateScore should return success: true and proper message', async () => {
    const res = await matchController.updateScore('m1', {
      score1: 3,
      score2: 1,
    });
    expect(res.success).toBe(true);
    expect(res.message).toBe(
      'Match score updated and winner propagated successfully',
    );
    expect(res.data).toBeDefined();
  });

  it('scoreCorrection should return success: true and proper message', async () => {
    const res = await matchController.scoreCorrection('m1', {
      score1: 2,
      score2: 1,
      reason: 'Score typo',
    });
    expect(res.success).toBe(true);
    expect(res.message).toBe(
      'Match score corrected successfully with audit log created',
    );
  });

  it('disputeMatch should return success: true and proper message', async () => {
    const res = await matchController.disputeMatch('m1', {
      reason: 'Controller disconnect',
    });
    expect(res.success).toBe(true);
    expect(res.message).toBe(
      'Match marked under review and dispute logged successfully',
    );
  });

  it('allocate should return success: true and proper message', async () => {
    const res = await matchController.allocate('m1', {
      venueId: 'v1',
      screenId: 's1',
      date: '2026-11-01',
      time: '10:00',
    });
    expect(res.success).toBe(true);
    expect(res.message).toBe('Match allocated to physical slot successfully');
  });

  it('unallocate should return success: true and proper message', async () => {
    const res = await matchController.unallocate('m1');
    expect(res.success).toBe(true);
    expect(res.message).toBe(
      'Match de-allocated from physical slot successfully',
    );
  });

  it('resolveDispute should return success: true and proper message', async () => {
    const res = await disputeController.resolveDispute('disp-01', {
      resolution: DisputeStatus.RESOLVED,
      reason: 'Footage verified',
    });
    expect(res.success).toBe(true);
    expect(res.message).toBe('Match dispute resolved successfully');
  });
});
