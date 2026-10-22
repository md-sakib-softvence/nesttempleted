import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TransferTicketDto {
  @ApiProperty({
    description: 'Ticket ID to transfer',
    example: 'cm1234567890abcdef',
  })
  @IsString()
  @IsNotEmpty()
  ticketId: string;

  @ApiProperty({
    description: 'Recipient phone number (e.g. +1 555 345 2311 or +2348012345678)',
    example: '+1 (555) 345-2311',
  })
  @IsString()
  @IsNotEmpty()
  recipientPhone: string;

  @ApiPropertyOptional({
    description: 'Recipient email address (optional)',
    example: 'friend@tapegaming.com',
  })
  @IsString()
  @IsOptional()
  recipientEmail?: string;
}
