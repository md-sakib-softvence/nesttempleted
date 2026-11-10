import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { MatchIncidentGateway } from './gateway/match-incident.gateway';
import { MatchIncidentService } from './service/match-incident.service';
import { MatchIncidentController } from './controller/match/match-incident.controller';
import { ManageEventCostController } from './controller/manage-event-cost/manage-event-cost.controller';
import { ManageEventCostService } from './service/manage-event-cost.service';
import { ManageEventPrizeController } from './controller/manage-event-prize/manage-event-prize.controller';
import { ManageEventPrizeService } from './service/manage-event-prize.service';
import { VenueController } from './controller/venue/venue.controller';
import { VenueService } from './service/venue.service';
import { SponsorController } from './controller/sponsor/sponsor.controller';
import { SponsorService } from './service/sponsor.service';
import { RaffleController } from './controller/raffle/raffle.controller';
import { RaffleService } from './service/raffle.service';

import { TournamentController } from './controller/tournament/tournament.controller';
import {
  AdminMatchController,
  AdminDisputeController,
} from './controller/match/match.controller';
import { AdminRegistrationController } from './controller/registration/registration.controller';
import { TournamentService } from './service/tournament.service';
import { TournamentScheduleService } from './service/tournament-schedule.service';
import { TournamentCoreService } from './service/tournament-core.service';
import { TournamentRegistrationService } from './service/tournament-registration.service';
import { TournamentMatchesService } from './service/tournament-matches.service';
import { TournamentLeaderboardService } from './service/tournament-leaderboard.service';
import { SelfScheduleWorkerService } from './service/self-schedule-worker.service';
import { NotificationModule } from '../notification/notification.module';

import { TournamentTabsController } from './controller/tournament/tournament-tabs.controller';
import { TournamentTabsService } from './service/tournament-tabs.service';
import { TournamentGuidelineController } from './controller/tournament/tournament-guideline.controller';
import { TournamentGuidelineService } from './service/tournament-guideline.service';

@Module({
  imports: [ConfigModule, JwtModule.register({}), NotificationModule],
  controllers: [
    MatchIncidentController,
    RaffleController,
    TournamentController,
    TournamentTabsController,
    TournamentGuidelineController,
    AdminMatchController,
    AdminDisputeController,
    AdminRegistrationController,
    ManageEventCostController,
    ManageEventPrizeController,
    VenueController,
    SponsorController,
  ],
  providers: [
    MatchIncidentGateway,
    MatchIncidentService,
    TournamentService,
    TournamentTabsService,
    TournamentGuidelineService,
    TournamentCoreService,
    TournamentRegistrationService,
    TournamentMatchesService,
    TournamentLeaderboardService,
    TournamentScheduleService,
    SelfScheduleWorkerService,
    RaffleService,
    ManageEventCostService,
    ManageEventPrizeService,
    VenueService,
    SponsorService,
  ],
  exports: [
    TournamentService,
    TournamentTabsService,
    TournamentGuidelineService,
    TournamentCoreService,
    TournamentRegistrationService,
    TournamentMatchesService,
    TournamentLeaderboardService,
    TournamentScheduleService,
    SelfScheduleWorkerService,
    RaffleService,
    ManageEventCostService,
    ManageEventPrizeService,
    VenueService,
    SponsorService,
  ],
})
export class TournamentModule {}
