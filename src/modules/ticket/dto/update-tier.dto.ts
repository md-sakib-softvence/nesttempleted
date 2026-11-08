import { IsString, IsNumber, Min, IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TicketAudienceRole, TicketType } from '@prisma/client';

export class UpdateTierDto {
  @ApiPropertyOptional({
    description: 'Name of the ticket tier',
    example: 'VIP Pass Updated',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Ticket type enum',
    enum: TicketType,
  })
  @IsEnum(TicketType)
  @IsOptional()
  type?: TicketType;

  @ApiPropertyOptional({ enum: TicketAudienceRole })
  @IsEnum(TicketAudienceRole)
  @IsOptional()
  audienceRole?: TicketAudienceRole;

  @ApiPropertyOptional({
    description: 'Price per ticket',
    example: 5000,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({
    description: 'Currency code',
    default: 'NGN',
  })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({
    description: 'Total capacity / seats allocated for this tier',
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  capacity?: number;

  @ApiPropertyOptional({
    description: 'Tier description or perks',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Tier display status (ACTIVE or HIDDEN)',
    example: 'ACTIVE',
  })
  @IsString()
  @IsOptional()
  status?: string;
}
