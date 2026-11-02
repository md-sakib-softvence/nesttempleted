import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateManageEventCostDto {
  @ApiPropertyOptional({
    description: 'Cost ID (for updates)',
    example: 'c-1',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({
    description: 'Cost ID alias (for updates)',
    example: 'c-1',
  })
  @IsOptional()
  @IsString()
  manageEventCostId?: string;

  @ApiPropertyOptional({
    description: 'Name of the cost (UI Alias)',
    example: 'Venue Rental',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Category of the event cost (UI Alias)',
    example: 'VENUE',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Category of the event cost (Prisma)',
    example: 'Venue Rental',
  })
  @Transform(({ value, obj }) => value || obj?.category || obj?.name || 'Cost')
  @IsOptional()
  @IsString()
  costCategory!: string;

  @ApiProperty({
    description: 'Amount for this cost category',
    example: 500,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Amount must be a positive number' })
  amount: number;
}

