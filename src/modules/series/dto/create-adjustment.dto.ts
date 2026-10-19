import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSeriesAdjustmentDto {
  @ApiPropertyOptional({
    description: 'Series participant ID',
    example: 'sp-01',
  })
  @IsString()
  @IsOptional()
  participantId?: string;

  @ApiPropertyOptional({
    description: 'Player ID (alias for participant resolution)',
    example: 'player-uuid',
  })
  @IsString()
  @IsOptional()
  playerId?: string;

  @ApiProperty({
    description: 'Points to add or deduct (+ or -)',
    example: -10,
  })
  @IsInt()
  points: number;

  @ApiProperty({
    description: 'Administrative reason for adjustment',
    example: 'Late arrival penalty during tournament round 2.',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
