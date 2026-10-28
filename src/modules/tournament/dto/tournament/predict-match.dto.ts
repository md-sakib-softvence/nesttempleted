import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, Min, Max } from 'class-validator';

export class PredictMatchDto {
  @ApiProperty({
    description: 'Match ID to predict outcome for',
    example: 'm-101',
  })
  @IsString()
  @IsNotEmpty()
  matchId: string;

  @ApiProperty({
    description: 'Selected winner ID (Player ID or "DRAW")',
    example: 'p-83',
  })
  @IsString()
  @IsNotEmpty()
  predictedWinnerId: string;

  @ApiProperty({
    description: 'Points/coins wagered on this prediction (min 20, max 500)',
    example: 100,
  })
  @IsNumber()
  @Min(20)
  @Max(500)
  wagerPoints: number;

  @ApiProperty({
    description:
      'Odds multiplier for the selected outcome (e.g. 1.85, 2.10, 3.10)',
    example: 1.85,
  })
  @IsNumber()
  @Min(1.0)
  odds: number;
}
