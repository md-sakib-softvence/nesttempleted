import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  IsNumber,
  Max,
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
    description: 'Tickets per checkout. Start another checkout to buy another ticket.',
    default: 1,
    minimum: 1,
    maximum: 1,
  })
  @IsNumber()
  @IsInt()
  @Min(1)
  @Max(1)
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ description: 'Player registration home venue ID' })
  @IsString()
  @IsOptional()
  homeVenueId?: string;

  @ApiPropertyOptional({
    description: 'Football tournament primary team ID/name',
  })
  @IsString()
  @IsOptional()
  primaryTeamId?: string;

  @ApiPropertyOptional({ description: 'Country/region of the primary club' })
  @IsString()
  @IsOptional()
  primaryTeamCountry?: string;

  @ApiPropertyOptional({
    description: 'Competition/series of the primary club',
  })
  @IsString()
  @IsOptional()
  primaryTeamCompetition?: string;

  @ApiPropertyOptional({
    description: 'Football tournament secondary team ID/name',
  })
  @IsString()
  @IsOptional()
  secondaryTeamId?: string;

  @ApiPropertyOptional({ description: 'Country/region of the secondary club' })
  @IsString()
  @IsOptional()
  secondaryTeamCountry?: string;

  @ApiPropertyOptional({
    description: 'Competition/series of the secondary club',
  })
  @IsString()
  @IsOptional()
  secondaryTeamCompetition?: string;
}
