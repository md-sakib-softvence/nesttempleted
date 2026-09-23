import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateVenueDto {
  @ApiPropertyOptional({
    description: 'Name of the venue',
    example: 'Main Arena North',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Address of the venue',
    example: '456 Stadium Road, Lagos',
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({
    description: 'Tournament ID associated with this venue (optional)',
    example: 'b7c25e8e-8a1a-4279-8dc6-8c467a840e71',
  })
  @IsUUID('4', { message: 'tournamentId must be a valid UUID' })
  @IsOptional()
  tournamentId?: string;

  @ApiPropertyOptional({
    description: 'List of screen names for this venue (optional)',
    example: ['Screen 1', 'Screen 2', 'Screen 3'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  screens?: string[];
}
