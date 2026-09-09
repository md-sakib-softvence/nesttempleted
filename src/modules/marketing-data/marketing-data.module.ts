import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MarketingDataService } from './service/marketing-data.service';
import { MarketingDataController } from './controller/marketing-data.controller';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, MailModule, JwtModule.register({})],
  controllers: [MarketingDataController],
  providers: [MarketingDataService],
  exports: [MarketingDataService],
})
export class MarketingDataModule {}
