import { Test, TestingModule } from '@nestjs/testing';
import { PublicSeriesController } from './public-series.controller';
import { SeriesService } from '../service/series.service';

describe('PublicSeriesController (Unit & Success Message Tests)', () => {
  let controller: PublicSeriesController;
  let service: any;

  beforeEach(async () => {
    service = {
      getPublicSeriesBySlug: jest.fn().mockResolvedValue({
        title: 'TAPE National Circuit',
        slug: 'tape-national-circuit',
      } as any),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicSeriesController],
      providers: [{ provide: SeriesService, useValue: service }],
    }).compile();

    controller = module.get<PublicSeriesController>(PublicSeriesController);
  });

  it('getPublicSeries should return public data with a clear success message', async () => {
    const res = await controller.getPublicSeries('tape-national-circuit');
    expect(res.success).toBe(true);
    expect(res.message).toBe('Public series details retrieved successfully');
    expect(res.data?.title).toBe('TAPE National Circuit');
  });
});
