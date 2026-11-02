import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateManageEventPrizeDto {
  @ApiPropertyOptional({
    description: 'Prize ID (for updates)',
    example: 'p-1',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({
    description: 'Prize ID alias (for updates)',
    example: 'p-1',
  })
  @IsOptional()
  @IsString()
  manageEventPrizeId?: string;

  @ApiPropertyOptional({
    description: 'Place rank (e.g. 1, 2, 3)',
    example: 1,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  place?: number;

  @ApiPropertyOptional({
    description: 'Payout amount alias',
    example: 250000,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  payout?: number;

  @ApiPropertyOptional({
    description: 'Prize label (e.g. 1st Place Champion)',
    example: '1st Place Champion',
  })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({
    description: 'Prize percentage share (e.g. 50)',
    example: 50,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  percentage?: number;

  @ApiPropertyOptional({
    description: 'Prize category (UI alias)',
    example: '1st Place Champion',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Category of the event prize (Prisma)',
    example: '1st Place Champion',
  })
  @Transform(
    ({ value, obj }) =>
      value ||
      obj?.label ||
      obj?.category ||
      (obj?.place ? `Place ${obj.place}` : 'Prize'),
  )
  @IsOptional()
  @IsString()
  prizeCategory!: string;

  @ApiProperty({
    description: 'Prize amount',
    example: 1000,
  })
  @Transform(
    ({ value, obj }) =>
      value !== undefined
        ? Number(value)
        : obj?.payout !== undefined
          ? Number(obj.payout)
          : 0,
  )
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Amount must be a positive number' })
  amount: number;
}

