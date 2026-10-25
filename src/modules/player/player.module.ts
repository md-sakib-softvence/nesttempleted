import { Module } from '@nestjs/common';
import { PlayerService } from './service/player.service';
import { PlayerDocumentService } from './service/player-document.service';
import { PlayerPassService } from './service/player-pass.service';
import { PlayerWalletService } from './service/player-wallet.service';
import { PlayerController } from './controller/player.controller';
import { PlayerWalletController } from './controller/player-wallet.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, MailModule, AuthModule],
  controllers: [PlayerController, PlayerWalletController],
  providers: [
    PlayerService,
    PlayerDocumentService,
    PlayerPassService,
    PlayerWalletService,
  ],
  exports: [
    PlayerService,
    PlayerDocumentService,
    PlayerPassService,
    PlayerWalletService,
  ],
})
export class PlayerModule {}
