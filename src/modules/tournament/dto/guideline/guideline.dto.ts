import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';
import {
  TournamentGuidelineAudience,
  TournamentGuidelineSection,
  TournamentGuidelineType,
} from '@prisma/client';

const ToBoolean = () =>
  Transform(({ value }) => value === true || value === 'true');

export class CreateTournamentGuidelineDto {
  @ApiProperty({ example: 'eligibility' })
  @IsString()
  key!: string;

  @ApiProperty({ enum: TournamentGuidelineSection, example: 'RULES' })
  @IsEnum(TournamentGuidelineSection)
  section!: TournamentGuidelineSection;

  @ApiProperty({ enum: TournamentGuidelineType, example: 'TEXT' })
  @IsEnum(TournamentGuidelineType)
  type!: TournamentGuidelineType;

  @ApiPropertyOptional({ enum: TournamentGuidelineAudience, default: 'ALL' })
  @IsOptional()
  @IsEnum(TournamentGuidelineAudience)
  audience?: TournamentGuidelineAudience;

  @ApiProperty({ example: 'Player eligibility' })
  @IsString()
  title!: string;

  @ApiPropertyOptional({ example: 'Players must be at least 16 years old.' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ example: 'https://example.com/privacy-policy' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  externalUrl?: string;

  @ApiPropertyOptional({ example: 1, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveAt?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  requiresAcceptance?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateTournamentGuidelineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  key?: string;

  @ApiPropertyOptional({ enum: TournamentGuidelineSection })
  @IsOptional()
  @IsEnum(TournamentGuidelineSection)
  section?: TournamentGuidelineSection;

  @ApiPropertyOptional({ enum: TournamentGuidelineType })
  @IsOptional()
  @IsEnum(TournamentGuidelineType)
  type?: TournamentGuidelineType;

  @ApiPropertyOptional({ enum: TournamentGuidelineAudience })
  @IsOptional()
  @IsEnum(TournamentGuidelineAudience)
  audience?: TournamentGuidelineAudience;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  externalUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  requiresAcceptance?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isPublished?: boolean;
}
