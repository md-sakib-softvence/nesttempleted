import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { TournamentStatus } from '@prisma/client';

export class UpdateTournamentStatusDto {
  @ApiProperty({ enum: TournamentStatus, example: 'PAUSED' })
  @IsEnum(TournamentStatus)
  @IsNotEmpty()
  status: TournamentStatus;

  @ApiPropertyOptional({
    description: 'Expected version for optimistic locking',
    example: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @ApiPropertyOptional({ example: 'Temporary venue power disruption' })
  @IsOptional()
  @IsString()
  reason?: string;
}
