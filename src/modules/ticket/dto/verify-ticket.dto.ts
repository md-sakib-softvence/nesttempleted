import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyTicketDto {
  @ApiProperty({
    description: 'Flutterwave transaction reference (tx_ref)',
    example: 'FLW-TCK-1718000000-abcd1234',
  })
  @IsString()
  @IsNotEmpty()
  txRef: string;

  @ApiPropertyOptional({
    description: 'Flutterwave numeric transaction ID',
    example: '2882001',
  })
  @IsOptional()
  transactionId?: string | number;
}
