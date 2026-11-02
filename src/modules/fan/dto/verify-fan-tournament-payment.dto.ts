import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyFanTournamentPaymentDto {
  @ApiProperty({ example: 'FLW-1730500000-a1b2c3d4' })
  @IsString()
  @IsNotEmpty()
  txRef: string;
}

