import { Module } from '@nestjs/common';
import { TicketController } from './controller/ticket.controller';
import { TicketService } from './service/ticket.service';
import { TicketScanGateway } from './gateway/ticket-scan.gateway';
import { PrismaModule } from '../../prisma/prisma.module';
import { FlutterwaveModule } from '../flutterwave/flutterwave.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, FlutterwaveModule, NotificationModule],
  controllers: [TicketController],
  providers: [TicketService, TicketScanGateway],
  exports: [TicketService, TicketScanGateway],
})
export class TicketModule {}
