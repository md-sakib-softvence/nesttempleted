import { Module } from '@nestjs/common';
import { FanService } from './service/fan.service';
import { FollowerService } from './service/follower.service';
import { FanController } from './controller/fan.controller';
import { FanFollowController } from './controller/fan.follow.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, MailModule, AuthModule],
  controllers: [FanFollowController, FanController],
  providers: [FanService, FollowerService],
  exports: [FanService, FollowerService],
})
export class FanModule {}
