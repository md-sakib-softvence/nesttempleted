import { Module } from '@nestjs/common';
import { FlutterwaveController } from './controller/flutterwave.controller';
import { FlutterwaveService } from './service/flutterwave.service';

@Module({
  controllers: [FlutterwaveController],
  providers: [FlutterwaveService],
  exports: [FlutterwaveService],
})
export class FlutterwaveModule {}
