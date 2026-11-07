import { Module } from '@nestjs/common';
import { FanService } from './service/fan.service';
import { FollowerService } from './service/follower.service';
import { FanController } from './controller/fan.controller';
import { FanFollowController } from './controller/fan.follow.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { FlutterwaveModule } from '../flutterwave/flutterwave.module';
import { TournamentModule } from '../tournament/tournament.module';
import { PlayerModule } from '../player/player.module';
import { FanPlayerRegistrationService } from './service/fan-player-registration.service';
import { FanCoinPurchaseService } from './service/fan-coin-purchase.service';

@Module({
  imports: [PrismaModule, MailModule, AuthModule, FlutterwaveModule, TournamentModule, PlayerModule],
  controllers: [FanFollowController, FanController],
  providers: [FanService, FollowerService, FanPlayerRegistrationService, FanCoinPurchaseService],
  exports: [FanService, FollowerService, FanPlayerRegistrationService, FanCoinPurchaseService],
})
export class FanModule {}
