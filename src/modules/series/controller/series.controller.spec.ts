import { Test, TestingModule } from '@nestjs/testing';
import { SeriesController } from './series.controller';
import { SeriesService } from '../service/series.service';
import { SeriesStatus } from '@prisma/client';

describe('SeriesController (API & Success Message Contract Tests)', () => {
  let controller: SeriesController;
  let service: any;

  beforeEach(async () => {
    service = {
      getAllSeries: jest.fn().mockResolvedValue({
        items: [{ id: 'series-1', name: 'Series 1' }],
        pagination: { totalItems: 1, page: 1, limit: 25, totalPages: 1 },
      }),
      getSeriesById: jest.fn().mockResolvedValue({ id: 'series-1', name: 'Series 1' }),
      createSeries: jest.fn().mockResolvedValue({
        id: 'series-1',
        name: 'Series 1',
        code: 'S1',
        status: SeriesStatus.DRAFT,
        published: false,
      }),
      updateSeries: jest.fn().mockResolvedValue({ id: 'series-1', version: 2 }),
      updateSeriesStatus: jest.fn().mockResolvedValue({ id: 'series-1', status: 'ACTIVE' }),
      getSeriesTournaments: jest.fn().mockResolvedValue({ tournaments: [] }),
      linkTournaments: jest.fn().mockResolvedValue({ tournaments: [] }),
      reorderTournaments: jest.fn().mockResolvedValue({ tournaments: [] }),
      unlinkTournament: jest.fn().mockResolvedValue({ unlinkedTournamentId: 't1' }),
      getSeriesParticipants: jest.fn().mockResolvedValue({ items: [], pagination: {} }),
      updateSeriesParticipant: jest.fn().mockResolvedValue({ id: 'p1', status: 'DISQUALIFIED' }),
      getSeriesLeaderboard: jest.fn().mockResolvedValue({ standings: [] }),
      recalculateSeriesStandings: jest.fn().mockResolvedValue({ participantsProcessed: 5 }),
      createPointAdjustment: jest.fn().mockResolvedValue({ adjustmentId: 'adj-1' }),
      getPointAdjustments: jest.fn().mockResolvedValue({ adjustments: [] }),
      getScoringConfig: jest.fn().mockResolvedValue({ scoringConfig: {} }),
      updateScoringConfig: jest.fn().mockResolvedValue({ scoringConfigId: 'cfg-1' }),
      getPublicationSettings: jest.fn().mockResolvedValue({ enabled: true }),
      updatePublicationSettings: jest.fn().mockResolvedValue({ status: 'PUBLISHED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SeriesController],
      providers: [{ provide: SeriesService, useValue: service }],
    }).compile();

    controller = module.get<SeriesController>(SeriesController);
  });

  it('findAll should return success: true and a clear success message', async () => {
    const res = await controller.findAll({});
    expect(res.success).toBe(true);
    expect(res.message).toBe('Series retrieved successfully');
    expect(res.data).toBeDefined();
  });

  it('findOne should return success: true and a clear success message', async () => {
    const res = await controller.findOne('series-1');
    expect(res.success).toBe(true);
    expect(res.message).toBe('Series details retrieved successfully');
    expect(res.data.id).toBe('series-1');
  });

  it('create should return success: true and Series created successfully', async () => {
    const res = await controller.create({
      name: 'Test',
      code: 'T1',
      startDate: '2026-11-01',
      scoringConfig: {},
    });
    expect(res.success).toBe(true);
    expect(res.message).toBe('Series created successfully');
  });

  it('updateStatus should return status-specific success message', async () => {
    const res = await controller.updateStatus('series-1', {
      status: SeriesStatus.ACTIVE,
    });
    expect(res.success).toBe(true);
    expect(res.message).toContain('ACTIVE successfully');
  });

  it('recalculate should return standings recalculated successfully', async () => {
    const res = await controller.recalculate('series-1');
    expect(res.success).toBe(true);
    expect(res.message).toBe('Series standings recalculated successfully');
  });

  it('createAdjustment should return point adjustment applied successfully', async () => {
    const res = await controller.createAdjustment('series-1', {
      participantId: 'p1',
      points: -5,
      reason: 'Late arrival',
    });
    expect(res.success).toBe(true);
    expect(res.message).toBe('Point adjustment applied successfully');
  });
});
