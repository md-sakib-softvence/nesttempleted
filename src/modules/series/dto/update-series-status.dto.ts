import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { SeriesStatus } from '@prisma/client';

export class UpdateSeriesStatusDto {
  @ApiProperty({ enum: SeriesStatus, example: SeriesStatus.ACTIVE })
  @IsEnum(SeriesStatus)
  @IsNotEmpty()
  status: SeriesStatus;

  @ApiPropertyOptional({ description: 'Expected version for optimistic locking', example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @ApiPropertyOptional({ example: 'Series season officially underway' })
  @IsOptional()
  @IsString()
  reason?: string;
}
