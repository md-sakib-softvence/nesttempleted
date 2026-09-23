import { Module } from '@nestjs/common';
import { ManageEventCostController } from './controller/manage-event-cost/manage-event-cost.controller';
import { ManageEventCostService } from './service/manage-event-cost.service';
import { ManageEventPrizeController } from './controller/manage-event-prize/manage-event-prize.controller';
import { ManageEventPrizeService } from './service/manage-event-prize.service';
import { VenueController } from './controller/venue/venue.controller';
import { VenueService } from './service/venue.service';
import { SponsorController } from './controller/sponsor/sponsor.controller';
import { SponsorService } from './service/sponsor.service';

import { TournamentController } from './controller/tournament/tournament.controller';
import { TournamentService } from './service/tournament.service';
import { TournamentScheduleService } from './service/tournament-schedule.service';

@Module({
  controllers: [
    TournamentController,
    ManageEventCostController,
    ManageEventPrizeController,
    VenueController,
    SponsorController,
  ],
  providers: [
    TournamentService,
    TournamentScheduleService,
    ManageEventCostService,
    ManageEventPrizeService,
    VenueService,
    SponsorService,
  ],
  exports: [
    TournamentService,
    TournamentScheduleService,
    ManageEventCostService,
    ManageEventPrizeService,
    VenueService,
    SponsorService,
  ],
})
export class TournamentModule {}
