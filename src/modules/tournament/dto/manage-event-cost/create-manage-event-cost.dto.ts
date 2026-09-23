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

export class CreateManageEventCostDto {
  @ApiProperty({
    description: 'Category of the event cost',
    example: 'Venue Rental',
  })
  @IsString()
  @IsNotEmpty()
  costCategory: string;

  @ApiProperty({
    description: 'Amount for this cost category',
    example: 500,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Amount must be a positive number' })
  amount: number;

  @ApiPropertyOptional({
    description: 'Tournament ID associated with this cost (optional)',
    example: 'b7c25e8e-8a1a-4279-8dc6-8c467a840e71',
  })
  @IsUUID('4', { message: 'tournamentId must be a valid UUID' })
  @IsOptional()
  tournamentId?: string;
}
