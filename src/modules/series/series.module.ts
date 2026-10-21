import { Module } from '@nestjs/common';
import { SeriesController } from './controller/series.controller';
import { PublicSeriesController } from './controller/public-series.controller';
import { SeriesService } from './service/series.service';
import { SeriesCoreService } from './service/series-core.service';
import { SeriesTournamentsService } from './service/series-tournaments.service';
import { SeriesParticipantsService } from './service/series-participants.service';
import { SeriesLeaderboardService } from './service/series-leaderboard.service';
import { SeriesPublicationService } from './service/series-publication.service';

@Module({
  controllers: [SeriesController, PublicSeriesController],
  providers: [
    SeriesCoreService,
    SeriesTournamentsService,
    SeriesParticipantsService,
    SeriesLeaderboardService,
    SeriesPublicationService,
    SeriesService,
  ],
  exports: [
    SeriesCoreService,
    SeriesTournamentsService,
    SeriesParticipantsService,
    SeriesLeaderboardService,
    SeriesPublicationService,
    SeriesService,
  ],
})
export class SeriesModule {}
