import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketAudienceRole, TicketType } from '@prisma/client';

export class CreateTierDto {
  @ApiProperty({
    description: 'Tournament ID to associate this tier with',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  tournamentId: string;

  @ApiProperty({
    description: 'Name of the ticket tier (e.g. Day Pass, VIP Pass)',
    example: 'Day Pass',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Ticket type enum',
    enum: TicketType,
    default: TicketType.DAY_PASS,
  })
  @IsEnum(TicketType)
  @IsOptional()
  type?: TicketType;

  @ApiPropertyOptional({ enum: TicketAudienceRole, default: TicketAudienceRole.FAN })
  @IsEnum(TicketAudienceRole)
  @IsOptional()
  audienceRole?: TicketAudienceRole;

  @ApiProperty({
    description: 'Price per ticket in the tournament currency',
    example: 1500,
  })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({
    description: 'Currency code',
    default: 'NGN',
  })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({
    description: 'Total capacity / seats allocated for this tier',
    default: 100,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  capacity?: number;

  @ApiPropertyOptional({
    description: 'Tier description or perks',
    example: 'Access for one full day of the event with standard seating.',
  })
  @IsString()
  @IsOptional()
  description?: string;
}
