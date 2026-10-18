import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Min, IsOptional, IsString, IsIn } from 'class-validator';

export class UpdateMatchScoreDto {
  @ApiProperty({ description: 'Score for participant 1', example: 3 })
  @IsInt()
  @Min(0)
  score1: number;

  @ApiProperty({ description: 'Score for participant 2', example: 1 })
  @IsInt()
  @Min(0)
  score2: number;

  @ApiPropertyOptional({
    description: 'Match status',
    enum: ['COMPLETED', 'NO_SHOW', 'IN_PROGRESS', 'UNDER_REVIEW'],
    default: 'COMPLETED',
  })
  @IsOptional()
  @IsString()
  @IsIn(['COMPLETED', 'NO_SHOW', 'IN_PROGRESS', 'UNDER_REVIEW'])
  status?: string = 'COMPLETED';

  @ApiPropertyOptional({
    description: 'Offending player ID if marked as No-Show',
    example: 'player-uuid-1',
  })
  @IsOptional()
  @IsString()
  offendingPlayerId?: string;
}
