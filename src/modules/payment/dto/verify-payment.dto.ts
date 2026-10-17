import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyPaymentDto {
  @ApiProperty({
    example: 'ref_1234567890',
    description: 'Paystack payment transaction reference',
  })
  @IsString()
  @IsNotEmpty()
  reference: string;
}
