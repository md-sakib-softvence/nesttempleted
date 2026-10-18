import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTournamentRegistrationDto {
  @ApiProperty({ description: 'Player ID registering for tournament' })
  @IsString()
  @IsNotEmpty()
  playerId: string;

  @ApiPropertyOptional({ description: 'Selected home venue ID' })
  @IsString()
  @IsOptional()
  homeVenueId?: string;

  @ApiPropertyOptional({ description: 'Primary chosen team ID/Name', example: 'Real Madrid' })
  @IsString()
  @IsOptional()
  primaryTeamId?: string;

  @ApiPropertyOptional({ description: 'Secondary chosen team ID/Name', example: 'Arsenal FC' })
  @IsString()
  @IsOptional()
  secondaryTeamId?: string;

  @ApiPropertyOptional({ description: 'Player shirt/jersey size', example: 'L' })
  @IsString()
  @IsOptional()
  jerseySize?: string;

  @ApiPropertyOptional({ description: 'Player photo URL' })
  @IsString()
  @IsOptional()
  playerPhotoUrl?: string;
}
