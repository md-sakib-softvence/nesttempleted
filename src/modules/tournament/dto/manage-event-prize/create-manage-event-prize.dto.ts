import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

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
}

