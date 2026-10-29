import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { TournamentMatchesService } from './tournament-matches.service';

/**
 * SelfScheduleWorkerService
 *
 * Background scheduled worker that periodically inspects PLAYER_SELF tournaments
 * and automatically assigns matches that have reached Phase 3 (96h+ elapsed).
 * If no valid slot exists, transitions the match into CAPACITY_BLOCKED / ADMIN_ACTION_REQUIRED.
 */
@Injectable()
export class SelfScheduleWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SelfScheduleWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly tournamentMatchesService: TournamentMatchesService,
  ) {}

  onModuleInit() {
    this.logger.log(
      'Starting Self-Scheduling Phase 3 Auto-Assignment Worker...',
    );
    // Initial run after 10 seconds, then repeat every 60 seconds
    setTimeout(() => {
      this.runCycle();
    }, 10000);

    this.timer = setInterval(() => {
      this.runCycle();
    }, 60000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.log('Stopped Self-Scheduling Worker.');
  }

  private async runCycle() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      const outcome =
        await this.tournamentMatchesService.processDueAutoAssignments();
      if (outcome.totalProcessed > 0) {
        this.logger.log(
          `Auto-assignment cycle completed. Processed ${outcome.totalProcessed} matches.`,
        );
      }
    } catch (error: any) {
      this.logger.warn(
        `Self-scheduling auto-assignment cycle delayed (will retry next interval): ${error?.message || error}`,
      );
    } finally {
      this.isProcessing = false;
    }
  }
}
