import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { FrequencyStatus } from '@prisma/client';

export class GenerateCalendarDto {
  @ApiPropertyOptional({
    description: 'Daily Start Time (HH:mm)',
    example: '10:00',
  })
  @IsString()
  @IsOptional()
  dailyStart?: string;

  @ApiPropertyOptional({
    description: 'Daily End Time (HH:mm)',
    example: '20:00',
  })
  @IsString()
  @IsOptional()
  dailyEnd?: string;

  @ApiPropertyOptional({
    description: 'Match duration in minutes',
    example: 25,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  matchDuration?: number;

  @ApiPropertyOptional({
    description: 'Turnover duration between matches in minutes',
    example: 5,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  turnoverDuration?: number;

  @ApiPropertyOptional({
    description: 'Lunch break start time (HH:mm)',
    example: '14:00',
  })
  @IsString()
  @IsOptional()
  lunchBreakTime?: string;

  @ApiPropertyOptional({
    description: 'Lunch break duration in minutes',
    example: 60,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  lunchDuration?: number;

  @ApiPropertyOptional({
    description: 'Buffer days',
    example: 0,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  buffer?: number;

  @ApiPropertyOptional({
    description: 'Frequency Status',
    enum: FrequencyStatus,
    example: FrequencyStatus.DAILY,
  })
  @IsEnum(FrequencyStatus)
  @IsOptional()
  frequencyStatus?: FrequencyStatus;

  @ApiPropertyOptional({
    description: 'Allowed playing days of the week',
    example: ['Sat', 'Sun'],
    type: [String],
  })
  @IsArray()
  @IsOptional()
  frequencyArray?: string[];

  @ApiPropertyOptional({
    description: 'Scheduling booking window policy',
    example: {
      isWindowOpen: false,
      windowOpenTime: '2026-10-01T08:00:00Z',
      windowCloseTime: '2026-10-02T20:00:00Z',
    },
  })
  @IsOptional()
  schedulingPolicy?: {
    isWindowOpen?: boolean;
    windowOpenTime?: string;
    windowCloseTime?: string;
  };
}
