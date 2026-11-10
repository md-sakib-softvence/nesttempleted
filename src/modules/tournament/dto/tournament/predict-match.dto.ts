import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsInt, IsString, Min, Max, IsOptional } from 'class-validator';

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
    description: 'Prediction coins wagered (min 20, max 500)',
    example: 100,
  })
  @IsInt()
  @Min(20)
  @Max(500)
  wagerCoins: number;

  @ApiProperty({
    description: 'Selected payout multiplier (1x to 10x); defaults to 2x for older clients',
    example: 2,
    minimum: 1,
    maximum: 10,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  multiplier?: number;

}
