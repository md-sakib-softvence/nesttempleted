import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateFanTournamentApplicationDto {
  @ApiPropertyOptional({ description: 'Home venue belonging to this tournament' })
  @IsOptional()
  @IsString()
  homeVenueId?: string;

  @ApiPropertyOptional({ description: 'Primary club selection for football games' })
  @IsOptional()
  @IsString()
  primaryTeamId?: string;

  @ApiPropertyOptional({ description: 'Backup club selection for football games' })
  @IsOptional()
  @IsString()
  secondaryTeamId?: string;

  @ApiPropertyOptional({ description: 'Jersey size when required by the tournament' })
  @IsOptional()
  @IsString()
  jerseySize?: string;
}
