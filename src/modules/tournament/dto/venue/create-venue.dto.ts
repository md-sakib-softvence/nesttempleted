import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateVenueDto {
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
    description: 'List of screen names for this venue (optional)',
    example: ['Screen 1', 'Screen 2'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  screens?: string[];
}
