import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  SeriesParticipantStatus,
  SeriesQualificationStatus,
} from '@prisma/client';

export class QuerySeriesParticipantDto {
  @ApiPropertyOptional({ enum: SeriesParticipantStatus })
  @IsOptional()
  @Transform(({ value }) =>
    !value || value === 'ALL' || value === 'all' ? undefined : value,
  )
  @IsEnum(SeriesParticipantStatus)
  status?: SeriesParticipantStatus;

  @ApiPropertyOptional({ enum: SeriesQualificationStatus })
  @IsOptional()
  @Transform(({ value }) =>
    !value || value === 'ALL' || value === 'all' ? undefined : value,
  )
  @IsEnum(SeriesQualificationStatus)
  qualificationStatus?: SeriesQualificationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  approved?: boolean;

  @ApiPropertyOptional({ description: 'Search gamerTag or name' })
  @IsOptional()
  @Transform(({ value, obj }) => value || obj?.searchTerm)
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 25, example: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 25;
}

export class RecalculateSeriesDto {
  @ApiPropertyOptional({ default: true, example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  forceAll?: boolean = true;
}
