import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ProposeSlotDto {
  @ApiProperty({ description: 'Target Venue ID', example: 'venue-1' })
  @IsNotEmpty()
  @IsString()
  venueId: string;

  @ApiProperty({ description: 'Target Screen ID', example: 'screen-1' })
  @IsNotEmpty()
  @IsString()
  screenId: string;

  @ApiProperty({ description: 'Target Playing Date (YYYY-MM-DD)', example: '2026-10-26' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be formatted as YYYY-MM-DD' })
  date: string;

  @ApiProperty({ description: 'Target Timeslot (HH:mm)', example: '14:00' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Time must be in 24-hour format HH:mm',
  })
  time: string;
}
