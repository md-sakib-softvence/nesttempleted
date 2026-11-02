import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class MatchCheckInDto {
  @ApiProperty({ description: 'Exact QR payload from the player tournament pass' })
  @IsString()
  @MinLength(1)
  qrToken: string;

  @ApiPropertyOptional({ description: 'The player card currently being checked in' })
  @IsOptional()
  @IsString()
  expectedPlayerId?: string;
}
