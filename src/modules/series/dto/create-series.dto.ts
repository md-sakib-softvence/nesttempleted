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
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'TNC26' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ example: 'The premier multi-city esports circuit across Nigeria.' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Series Logo Image (choose file)',
  })
  @IsOptional()
  logo?: any;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Series Logo Image file or URL (choose file)',
  })
  @IsOptional()
  logoUrl?: any;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Series Cover Image (choose file)',
  })
  @IsOptional()
  image?: any;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Series Cover Image file or URL (choose file)',
  })
  @IsOptional()
  imageUrl?: any;

  @ApiProperty({ example: '2026-11-01' })
  @Transform(({ value }) => {
    if (!value) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const parts = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (parts) {
        const [, m, d, y] = parts;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        return d.toISOString();
      }
    }
    return value;
  })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({ example: '2026-12-20' })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value || value === '' || value === 'null' || value === 'undefined') return undefined;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const parts = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (parts) {
        const [, m, d, y] = parts;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        return d.toISOString();
      }
    }
    return value;
  })
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ enum: SeriesStatus, default: SeriesStatus.DRAFT })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsEnum(SeriesStatus)
  status?: SeriesStatus;

  @ApiPropertyOptional({ enum: SeriesParticipantType, default: SeriesParticipantType.PLAYER })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return SeriesParticipantType.PLAYER;
    if (typeof value === 'string') {
      const normalized = value.trim().toUpperCase().replace(/\s+/g, '_');
      if (
        normalized === 'INDIVIDUAL' ||
        normalized === 'INDIVIDUAL_PLAYERS' ||
        normalized === 'INDIVIDUAL_PLAYER' ||
        normalized === 'PLAYER' ||
        normalized === 'PLAYERS'
      ) {
        return SeriesParticipantType.PLAYER;
      }
      if (normalized === 'TEAM' || normalized === 'TEAMS') {
        return SeriesParticipantType.TEAM;
      }
    }
    return value;
  })
  @IsEnum(SeriesParticipantType)
  participantType?: SeriesParticipantType;

  @ApiPropertyOptional({ enum: SeriesParticipationMode, default: SeriesParticipationMode.OPEN_SERIES })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
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
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
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
  @Transform(({ value, obj }) => {
    const raw = value !== undefined ? value : obj?.tournaments;
    if (!raw) return [];
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => (typeof item === 'object' && item ? item.id || item.tournamentId : item))
            .filter(Boolean);
        }
      } catch {}
      return raw.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    if (Array.isArray(raw)) {
      return raw
        .map((item) => (typeof item === 'object' && item ? item.id || item.tournamentId : item))
        .filter(Boolean);
    }
    return [];
  })
  @IsArray()
  @IsString({ each: true })
  tournamentIds?: string[];

  @ApiPropertyOptional({
    description: 'Alternative alias for tournamentIds or list of selected tournaments',
  })
  @IsOptional()
  @Transform(({ value, obj }) => {
    if (!value) return value;
    let list: string[] = [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          list = parsed
            .map((item) => (typeof item === 'object' && item ? item.id || item.tournamentId : item))
            .filter(Boolean);
        }
      } catch {}
      if (!list.length) {
        list = value.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
    } else if (Array.isArray(value)) {
      list = value
        .map((item) => (typeof item === 'object' && item ? item.id || item.tournamentId : item))
        .filter(Boolean);
    }
    if (obj && (!obj.tournamentIds || !obj.tournamentIds.length)) {
      obj.tournamentIds = list;
    }
    return list;
  })
  tournaments?: any;

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
