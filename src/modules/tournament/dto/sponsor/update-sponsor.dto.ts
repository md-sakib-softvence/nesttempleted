import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { SponsorStatus } from '@prisma/client';

export class UpdateSponsorDto {
  @ApiPropertyOptional({
    description: 'Sponsor name',
    example: 'Monster Energy',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Sponsor logo URL',
    example: 'https://example.com/logo.png',
  })
  @IsString()
  @IsOptional()
  logo?: string;

  @ApiPropertyOptional({
    description: 'Sponsor website URL',
    example: 'https://monsterenergy.com',
  })
  @IsString()
  @IsOptional()
  website?: string;

  @ApiPropertyOptional({
    description: 'Sponsorship priority level',
    example: 'Secondary',
  })
  @IsString()
  @IsOptional()
  priority?: string;

  @ApiPropertyOptional({
    description: 'Contact person or info',
    example: 'partner@monsterenergy.com',
  })
  @IsString()
  @IsOptional()
  contact?: string;

  @ApiPropertyOptional({
    description: 'Sponsorship value amount',
    example: 15000,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Value must be a positive number' })
  @IsOptional()
  value?: number;

  @ApiPropertyOptional({
    description: 'Sponsor target audience status',
    enum: SponsorStatus,
  })
  @IsEnum(SponsorStatus)
  @IsOptional()
  status?: SponsorStatus;

  @ApiPropertyOptional({
    description: 'Tournament ID associated with this sponsor (optional)',
    example: 'b7c25e8e-8a1a-4279-8dc6-8c467a840e71',
  })
  @IsUUID('4', { message: 'tournamentId must be a valid UUID' })
  @IsOptional()
  tournamentId?: string;
}
