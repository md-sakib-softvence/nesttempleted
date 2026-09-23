import { Module } from '@nestjs/common';
import { AnnouncementController } from './controller/announcement.controller';
import { AnnouncementService } from './service/announcement.service';

@Module({
  controllers: [AnnouncementController],
  providers: [AnnouncementService],
  exports: [AnnouncementService],
})
export class AnnouncementModule {}
