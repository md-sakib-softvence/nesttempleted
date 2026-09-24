import { Module } from '@nestjs/common';
import { PlayerService } from './service/player.service';
import { PlayerController } from './controller/player.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, MailModule, AuthModule],
  controllers: [PlayerController],
  providers: [PlayerService],
  exports: [PlayerService],
})
export class PlayerModule {}
