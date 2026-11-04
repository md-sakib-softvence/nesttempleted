import { Module } from '@nestjs/common';
import { AnnouncementController } from './controller/announcement.controller';
import { AnnouncementService } from './service/announcement.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [AnnouncementController],
  providers: [AnnouncementService],
  exports: [AnnouncementService],
})
export class AnnouncementModule {}
