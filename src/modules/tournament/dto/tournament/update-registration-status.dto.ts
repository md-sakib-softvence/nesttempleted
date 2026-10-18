import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TournamentRegistrationStatus } from '@prisma/client';

export class UpdateRegistrationStatusDto {
  @ApiProperty({
    description: 'Updated Registration Status',
    enum: TournamentRegistrationStatus,
    example: TournamentRegistrationStatus.CONFIRMED,
  })
  @IsEnum(TournamentRegistrationStatus)
  @IsNotEmpty()
  status: TournamentRegistrationStatus;

  @ApiPropertyOptional({
    description: 'Updated Payment Status (PENDING, PAID, CONFIRMED, REFUNDED)',
    example: 'PAID',
  })
  @IsString()
  @IsOptional()
  paymentStatus?: string;
}
