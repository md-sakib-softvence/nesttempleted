import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class UpdateManageEventCostDto {
  @ApiPropertyOptional({
    description: 'Category of the event cost',
    example: 'Audio/Visual Equipment',
  })
  @IsString()
  @IsOptional()
  costCategory?: string;

  @ApiPropertyOptional({
    description: 'Amount for this cost category',
    example: 750,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Amount must be a positive number' })
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({
    description: 'Tournament ID associated with this cost (optional)',
    example: 'b7c25e8e-8a1a-4279-8dc6-8c467a840e71',
  })
  @IsUUID('4', { message: 'tournamentId must be a valid UUID' })
  @IsOptional()
  tournamentId?: string;
}
