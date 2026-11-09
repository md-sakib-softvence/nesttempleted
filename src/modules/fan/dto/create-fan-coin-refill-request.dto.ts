import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateFanCoinRefillRequestDto {
  @ApiProperty({ example: 100, description: 'Number of free coins requested' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  requestedCoins: number;

  @ApiPropertyOptional({ example: 'I have used my coins and would like a refill.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
