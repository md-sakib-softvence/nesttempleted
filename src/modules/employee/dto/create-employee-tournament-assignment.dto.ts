import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEmployeeTournamentAssignmentDto {
  @ApiProperty({ description: 'Tournament UUID' })
  @IsString()
  @MaxLength(100)
  tournamentId: string;

  @ApiPropertyOptional({ description: 'Venue UUID; omit to grant all venues' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  venueId?: string;

  @ApiPropertyOptional({ description: 'Screen UUID inside the selected venue' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  screenId?: string;
}
