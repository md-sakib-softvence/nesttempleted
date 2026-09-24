import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MarketingDataService } from './service/marketing-data.service';
import { MarketingDataController } from './controller/marketing-data.controller';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, MailModule, AuthModule],
  controllers: [MarketingDataController],
  providers: [MarketingDataService],
  exports: [MarketingDataService],
})
export class MarketingDataModule {}
