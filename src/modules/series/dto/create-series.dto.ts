import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsArray,
  IsDateString,
  IsObject,
  IsBoolean,
} from 'class-validator';
import {
  SeriesParticipantType,
  SeriesParticipationMode,
  SeriesScoringMethod,
  SeriesStatus,
} from '@prisma/client';
import { Transform } from 'class-transformer';

export class CreateSeriesDto {
  @ApiProperty({ example: 'TAPE National Circuit 2026' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'TNC26' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ example: 'The premier multi-city esports circuit across Nigeria.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'https://assets.tape-esports.com/series/tnc-logo.png' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'https://assets.tape-esports.com/series/tnc-cover.jpg' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ example: '2026-11-01' })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({ example: '2026-12-20' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ enum: SeriesStatus, default: SeriesStatus.DRAFT })
  @IsOptional()
  @IsEnum(SeriesStatus)
  status?: SeriesStatus;

  @ApiPropertyOptional({ enum: SeriesParticipantType, default: SeriesParticipantType.PLAYER })
  @IsOptional()
  @IsEnum(SeriesParticipantType)
  participantType?: SeriesParticipantType;

  @ApiPropertyOptional({ enum: SeriesParticipationMode, default: SeriesParticipationMode.OPEN_SERIES })
  @IsOptional()
  @IsEnum(SeriesParticipationMode)
  participationMode?: SeriesParticipationMode;

  @ApiPropertyOptional({ example: 2, default: 1 })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined && value !== '' ? Number(value) : 1))
  @IsInt()
  @Min(0)
  minimumEventsRequired?: number;

  @ApiPropertyOptional({ enum: SeriesScoringMethod, default: SeriesScoringMethod.CUMULATIVE })
  @IsOptional()
  @IsEnum(SeriesScoringMethod)
  scoringMethod?: SeriesScoringMethod;

  @ApiPropertyOptional({ example: 3, default: 0 })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined && value !== '' ? Number(value) : 0))
  @IsInt()
  @Min(0)
  bestNResults?: number;

  @ApiPropertyOptional({ type: [String], example: ['tourn-ea-fc25-lagos-01'], default: [] })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
      return value.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    return Array.isArray(value) ? value : [];
  })
  @IsArray()
  @IsString({ each: true })
  tournamentIds?: string[];

  @ApiPropertyOptional({
    example: {
      name: 'Standard Grand Prix Scoring',
      placementPoints: { '1': 100, '2': 80, '3': 65, '4': 50 },
      participationPoints: 5,
      matchWinPoints: 3,
      matchDrawPoints: 1,
      matchLossPoints: 0,
      bonusRules: { championBonus: 25 },
    },
  })
  @Transform(({ value }) => {
    if (!value) {
      return {
        name: 'Standard Grand Prix Scoring',
        placementPoints: { '1': 100, '2': 75, '3': 50 },
        participationPoints: 5,
      };
    }
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  })
  @IsObject()
  @IsOptional()
  scoringConfig?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Publish series immediately', default: false })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  published?: boolean;
}
