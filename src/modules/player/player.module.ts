import { Module } from '@nestjs/common';
import { PlayerService } from './service/player.service';
import { PlayerDocumentService } from './service/player-document.service';
import { PlayerPassService } from './service/player-pass.service';
import { PlayerWalletService } from './service/player-wallet.service';
import { PlayerRefillService } from './service/player-refill.service';
import { PlayerController } from './controller/player.controller';
import { PlayerWalletController } from './controller/player-wallet.controller';
import { AdminPayoutController } from './controller/admin-payout.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { FlutterwaveModule } from '../flutterwave/flutterwave.module';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    AuthModule,
    NotificationModule,
    FlutterwaveModule,
  ],
  controllers: [
    PlayerController,
    PlayerWalletController,
    AdminPayoutController,
  ],
  providers: [
    PlayerService,
    PlayerDocumentService,
    PlayerPassService,
    PlayerWalletService,
    PlayerRefillService,
  ],
  exports: [
    PlayerService,
    PlayerDocumentService,
    PlayerPassService,
    PlayerWalletService,
    PlayerRefillService,
  ],
})
export class PlayerModule {}
