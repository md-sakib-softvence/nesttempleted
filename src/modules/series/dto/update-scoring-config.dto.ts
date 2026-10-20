import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class UpdateSeriesScoringConfigDto {
  @ApiPropertyOptional({ example: 'Updated Championship Formula' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    example: {
      '1': 120,
      '2': 90,
      '3': 70,
      '4': 50,
      '5': 30,
    },
  })
  @IsObject()
  @IsNotEmpty()
  placementPoints: Record<string, number>;

  @ApiPropertyOptional({ example: 5, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  participationPoints?: number;

  @ApiPropertyOptional({ example: 3, default: 3 })
  @IsOptional()
  @IsInt()
  matchWinPoints?: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  matchDrawPoints?: number;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  matchLossPoints?: number;

  @ApiPropertyOptional({
    example: { 'tourn-grand-finale-01': 2.0 },
  })
  @IsOptional()
  @IsObject()
  weighting?: Record<string, number>;

  @ApiPropertyOptional({
    example: { championBonus: 30, cleanSheetBonus: 10 },
  })
  @IsOptional()
  @IsObject()
  bonusRules?: Record<string, any>;
}
