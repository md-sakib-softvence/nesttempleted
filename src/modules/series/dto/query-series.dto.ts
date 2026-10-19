import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { SeriesStatus } from '@prisma/client';

export class QuerySeriesDto {
  @ApiPropertyOptional({ enum: SeriesStatus })
  @IsOptional()
  @IsEnum(SeriesStatus)
  status?: SeriesStatus;

  @ApiPropertyOptional({ description: 'Search series name or code' })
  @IsOptional()
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
