import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { SponsorStatus } from '@prisma/client';

export enum SponsorPriority {
  PRIMARY = 'PRIMARY',
  SECONDARY = 'SECONDARY',
  THIRD = 'THIRD',
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
    example: SponsorPriority.PRIMARY,
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const upper = value.toUpperCase();
      if (upper === 'TERTIARY') return SponsorPriority.THIRD;
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
}
