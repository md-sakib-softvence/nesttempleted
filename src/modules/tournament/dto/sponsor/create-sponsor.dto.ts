import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { SponsorStatus } from '@prisma/client';

export type SponsorPriorityType = 'GOLD' | 'SILVER' | 'BRONZE' | 'TEAL';

export enum SponsorPriority {
  GOLD = 'GOLD',
  SILVER = 'SILVER',
  BRONZE = 'BRONZE',
  TEAL = 'TEAL',
}

export class CreateSponsorDto {
  @ApiProperty({
    description: 'Sponsor name',
    example: 'Red Bull',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Sponsor logo image file (choose file)',
  })
  @IsOptional()
  logo?: any;

  @ApiPropertyOptional({
    description: 'Sponsor website URL',
    example: 'https://redbull.com',
  })
  @IsString()
  @IsOptional()
  website?: string;

  @ApiPropertyOptional({
    description: 'Sponsorship priority level',
    enum: SponsorPriority,
    example: SponsorPriority.GOLD,
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const upper = value.toUpperCase();
      if (upper === 'PRIMARY') return SponsorPriority.GOLD;
      if (upper === 'SECONDARY') return SponsorPriority.SILVER;
      if (upper === 'THIRD' || upper === 'TERTIARY')
        return SponsorPriority.BRONZE;
      return upper as SponsorPriority;
    }
    return value;
  })
  @IsEnum(SponsorPriority)
  @IsOptional()
  priority?: SponsorPriority;

  @ApiPropertyOptional({
    description: 'Contact person or info',
    example: 'sponsor@redbull.com',
  })
  @IsString()
  @IsOptional()
  contact?: string;

  @ApiPropertyOptional({
    description: 'Sponsorship value amount',
    example: 10000,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Value must be a positive number' })
  @IsOptional()
  value?: number;

  @ApiPropertyOptional({
    description: 'Sponsor target audience status',
    enum: SponsorStatus,
    default: SponsorStatus.BOTH,
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
