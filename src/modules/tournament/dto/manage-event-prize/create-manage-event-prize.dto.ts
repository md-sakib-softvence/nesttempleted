import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateManageEventPrizeDto {
  @ApiProperty({
    description: 'Category of the event prize',
    example: '1st Place Winner',
  })
  @IsString()
  @IsNotEmpty()
  prizeCategory: string;

  @ApiProperty({
    description: 'Prize amount',
    example: 1000,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Amount must be a positive number' })
  amount: number;

  @ApiPropertyOptional({
    description: 'Tournament ID associated with this prize (optional)',
    example: 'b7c25e8e-8a1a-4279-8dc6-8c467a840e71',
  })
  @IsUUID('4', { message: 'tournamentId must be a valid UUID' })
  @IsOptional()
  tournamentId?: string;
}
