import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class UpdateManageEventPrizeDto {
  @ApiPropertyOptional({
    description: 'Category of the event prize',
    example: '2nd Place Runner-Up',
  })
  @IsString()
  @IsOptional()
  prizeCategory?: string;

  @ApiPropertyOptional({
    description: 'Prize amount',
    example: 500,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Amount must be a positive number' })
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({
    description: 'Tournament ID associated with this prize (optional)',
    example: 'b7c25e8e-8a1a-4279-8dc6-8c467a840e71',
  })
  @IsUUID('4', { message: 'tournamentId must be a valid UUID' })
  @IsOptional()
  tournamentId?: string;
}
