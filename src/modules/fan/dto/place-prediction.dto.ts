import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class PlacePredictionDto {
  @ApiProperty({
    description: 'Tournament ID (Must be LIVE / IN_PROGRESS)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  tournamentId: string;

  @ApiProperty({
    description: 'Match ID for the prediction',
    example: 'match-101',
  })
  @IsString()
  @IsNotEmpty()
  matchId: string;

  @ApiProperty({
    description: 'Predicted outcome: Player 1 ID, Player 2 ID, or DRAW',
    example: 'GamerTag83',
  })
  @IsString()
  @IsNotEmpty()
  predictedWinnerId: string;

  @ApiProperty({
    description: 'Points or coins wagered (min: 20 pts)',
    example: 100,
  })
  @IsNumber()
  @Min(20)
  wagerPoints: number;
}
