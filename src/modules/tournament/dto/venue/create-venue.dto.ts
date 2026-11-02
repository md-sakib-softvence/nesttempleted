import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateVenueDto {
  @ApiPropertyOptional({
    description: 'Venue ID (for updates)',
    example: '09e36829-8f8f-4829-bee3-c18abcc157b2',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({
    description: 'Venue ID alias (for updates)',
    example: '09e36829-8f8f-4829-bee3-c18abcc157b2',
  })
  @IsOptional()
  @IsString()
  venueId?: string;

  @ApiProperty({
    description: 'Name of the venue',
    example: 'Main Arena',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Address of the venue',
    example: '123 Esports Blvd, Lagos',
  })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({
    description: 'List of screen names or screen objects for this venue (optional)',
    example: ['Screen 1', 'Screen 2'],
  })
  @IsArray()
  @IsOptional()
  screens?: any[];
}

