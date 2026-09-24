import { Module } from '@nestjs/common';
import { FanService } from './service/fan.service';
import { FanController } from './controller/fan.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, MailModule, AuthModule],
  controllers: [FanController],
  providers: [FanService],
  exports: [FanService],
})
export class FanModule {}
