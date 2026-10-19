import { Module } from '@nestjs/common';
import { SeriesController } from './controller/series.controller';
import { PublicSeriesController } from './controller/public-series.controller';
import { SeriesService } from './service/series.service';

@Module({
  controllers: [SeriesController, PublicSeriesController],
  providers: [SeriesService],
  exports: [SeriesService],
})
export class SeriesModule {}
