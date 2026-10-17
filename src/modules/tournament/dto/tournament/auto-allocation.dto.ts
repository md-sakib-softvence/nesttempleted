import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { SchedulingMode } from '@prisma/client';

export class AutoAllocationDto {
  @ApiPropertyOptional({
    description:
      'Scheduling Mode override (e.g. AUTO_HOME_VENUE or AUTO_RANDOM)',
    enum: SchedulingMode,
    example: SchedulingMode.AUTO_HOME_VENUE,
  })
  @IsEnum(SchedulingMode)
  @IsOptional()
  mode?: SchedulingMode;

  @ApiPropertyOptional({
    description: 'Expected version',
    example: 1,
  })
  @IsOptional()
  expectedVersion?: number;
}
