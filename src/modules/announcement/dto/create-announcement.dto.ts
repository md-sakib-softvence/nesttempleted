import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { AnnouncementStatus } from '@prisma/client';

export class CreateAnnouncementDto {
  @ApiProperty({
    description: 'Subject / Title of the announcement',
    example: 'Tournament Delayed due to Rain',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Message body / content of the announcement',
    example: 'Due to severe weather conditions, matches scheduled for 2:00 PM will now commence at 4:00 PM.',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({
    description: 'Target Audience (e.g. GLOBAL, STAFF, PLAYERS_ALL, or a specific tournament ID)',
    example: 'GLOBAL',
    default: 'GLOBAL',
  })
  @IsString()
  @IsOptional()
  audience?: string;

  @ApiPropertyOptional({
    description: 'Delivery channels (e.g. APP, EMAIL, SMS)',
    example: ['APP', 'EMAIL'],
    default: ['APP'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  channels?: string[];

  @ApiPropertyOptional({
    description: 'Status of the announcement',
    enum: AnnouncementStatus,
    default: AnnouncementStatus.SENT,
    example: AnnouncementStatus.SENT,
  })
  @IsEnum(AnnouncementStatus)
  @IsOptional()
  status?: AnnouncementStatus;
}
