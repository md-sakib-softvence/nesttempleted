import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CheckInTicketDto {
  @ApiProperty({
    description:
      'Scanned QR token string (e.g. FAN:tournamentId:userId:ticketId or TICKET:tournamentId:ticketId:hash)',
    example: 'FAN:123e4567-e89b-12d3-a456-426614174000:fan_123:tck_456',
  })
  @IsString()
  @IsNotEmpty()
  qrToken: string;

  @ApiPropertyOptional({
    description:
      'Current tournament ID of the venue/scanner (for mismatch validation)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsOptional()
  tournamentId?: string;

  @ApiPropertyOptional({
    description: 'Venue ID where check-in occurred',
    example: 'venue_123',
  })
  @IsString()
  @IsOptional()
  venueId?: string;

  @ApiPropertyOptional({
    description: 'Screen or Gate ID where scanned',
    example: 'screen_gate_1',
  })
  @IsString()
  @IsOptional()
  screenId?: string;
}
