import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRaffleDto {
  @ApiProperty({ description: 'Raffle Name / Title', example: 'Apple AirPods Giveaway' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Prize Description', example: 'Apple AirPods Pro 2nd Gen' })
  @IsString()
  @IsNotEmpty()
  prizeDescription: string;

  @ApiPropertyOptional({ description: 'Tournament ID (required if not passed in URL path)', example: 'tournament-uuid' })
  @IsString()
  @IsOptional()
  tournamentId?: string;

  @ApiPropertyOptional({ description: 'Number of winners to draw', example: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  numberOfWinners?: number = 1;

  @ApiPropertyOptional({ description: 'Draw Date (ISO String)' })
  @IsDateString()
  @IsOptional()
  drawDate?: string;

  @ApiPropertyOptional({ description: 'Registration Close Date (ISO String)' })
  @IsDateString()
  @IsOptional()
  registrationCloseDate?: string;
}
