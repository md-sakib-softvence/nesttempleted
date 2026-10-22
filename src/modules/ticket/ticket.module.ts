import { Module } from '@nestjs/common';
import { TicketController } from './controller/ticket.controller';
import { TicketService } from './service/ticket.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { FlutterwaveModule } from '../flutterwave/flutterwave.module';

@Module({
  imports: [PrismaModule, FlutterwaveModule],
  controllers: [TicketController],
  providers: [TicketService],
  exports: [TicketService],
})
export class TicketModule {}
