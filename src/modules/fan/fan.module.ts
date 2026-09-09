import { Module } from '@nestjs/common';
import { FanService } from './service/fan.service';
import { FanController } from './controller/fan.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FanController],
  providers: [FanService],
  exports: [FanService],
})
export class FanModule {}
