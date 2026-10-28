import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateSeriesDto } from './create-series.dto';
import { IsInt, IsOptional, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateSeriesDto extends PartialType(CreateSeriesDto) {
  @ApiPropertyOptional({
    description: 'Expected version for optimistic locking',
    example: 1,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined && value !== '' ? Number(value) : undefined,
  )
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
