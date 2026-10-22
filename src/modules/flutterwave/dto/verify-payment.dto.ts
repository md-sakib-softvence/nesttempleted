import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyPaymentDto {
  @ApiProperty({
    example: '2882001',
    description: 'Flutterwave unique transaction ID or tx_ref',
  })
  @IsString()
  @IsNotEmpty()
  transactionId: string;
}
