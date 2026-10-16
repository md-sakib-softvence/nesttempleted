import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

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
}
