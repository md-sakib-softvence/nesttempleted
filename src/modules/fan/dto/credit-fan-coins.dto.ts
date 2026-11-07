import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreditFanCoinsDto {
  @ApiProperty({ description: 'Positive number of coins to credit', example: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ description: 'Reason for the coin credit' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  reason?: string;
}
