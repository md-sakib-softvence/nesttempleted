import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AllocateMatchDto {
  @ApiProperty({
    description: 'Target Venue ID',
    example: 'venue-uuid-1',
  })
  @IsString()
  @IsNotEmpty()
  venueId: string;

  @ApiProperty({
    description: 'Target Screen ID',
    example: 'screen-uuid-1',
  })
  @IsString()
  @IsNotEmpty()
  screenId: string;

  @ApiProperty({
    description: 'Scheduled Date (YYYY-MM-DD)',
    example: '2026-10-03',
  })
  @IsString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({
    description: 'Scheduled Timeslot (HH:mm)',
    example: '10:00',
  })
  @IsString()
  @IsNotEmpty()
  time: string;

  @ApiPropertyOptional({
    description: 'Expected Match Version for concurrency control',
    example: 1,
  })
  @IsOptional()
  expectedVersion?: number;

  @ApiPropertyOptional({
    description: 'Expected Schedule Version',
    example: 1,
  })
  @IsOptional()
  expectedScheduleVersion?: number;
}
