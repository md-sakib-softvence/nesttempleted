import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { SeriesStatus } from '@prisma/client';

export class QuerySeriesDto {
  @ApiPropertyOptional({ enum: SeriesStatus })
  @IsOptional()
  @Transform(({ value }) => (!value || value === 'ALL' || value === 'all' ? undefined : value))
  @IsEnum(SeriesStatus)
  status?: SeriesStatus;

  @ApiPropertyOptional({ description: 'Search series name or code' })
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
