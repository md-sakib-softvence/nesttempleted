import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketType } from '@prisma/client';

export class PurchaseTicketDto {
  @ApiProperty({
    description: 'Tournament ID for which ticket is being purchased',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  tournamentId: string;

  @ApiPropertyOptional({
    description: 'Specific ticket tier ID (e.g. VIP Pass, Day Pass tier)',
    example: 'tier_12345',
  })
  @IsString()
  @IsOptional()
  tierId?: string;

  @ApiPropertyOptional({
    description: 'Ticket type: DAY_PASS, SEASON_PASS, or VIP',
    enum: TicketType,
    default: TicketType.DAY_PASS,
  })
  @IsEnum(TicketType)
  @IsOptional()
  type?: TicketType;

  @ApiPropertyOptional({
    description: 'Number of tickets to purchase (default 1)',
    default: 1,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({
    description: 'Requested seat number or designation (e.g. A-12)',
    example: 'A-12',
  })
  @IsString()
  @IsOptional()
  seatNumber?: string;
}
