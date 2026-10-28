import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ScoreCorrectionDto {
  @ApiProperty({ description: 'Corrected score for Participant 1', example: 2 })
  @IsInt()
  @Min(0)
  score1: number;

  @ApiProperty({ description: 'Corrected score for Participant 2', example: 1 })
  @IsInt()
  @Min(0)
  score2: number;

  @ApiProperty({
    description: 'Mandatory reason for score correction audit trail',
    example: 'Referee score sheet typo verified by official footage.',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({
    description:
      'Admin acknowledgement flag for modifying already-concluded match',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  acknowledgement?: boolean;

  @ApiPropertyOptional({
    description: 'Expected Match Version for concurrency control',
    example: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @ApiPropertyOptional({
    description: 'Original scores being corrected',
    example: { score1: 3, score2: 1 },
  })
  @IsOptional()
  @IsObject()
  expectedScore?: { score1: number; score2: number };
}
