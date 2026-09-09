import { Module } from '@nestjs/common';
import { MarketingDataService } from './service/marketing-data.service';
import { MarketingDataController } from './controller/marketing-data.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MarketingDataController],
  providers: [MarketingDataService],
  exports: [MarketingDataService],
})
export class MarketingDataModule {}
