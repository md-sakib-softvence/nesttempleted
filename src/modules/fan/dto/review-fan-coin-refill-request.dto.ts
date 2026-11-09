import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ReviewFanCoinRefillRequestDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  decision: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ example: 100, description: 'Required for approval; admin may grant fewer coins than requested.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  approvedCoins?: number;

  @ApiPropertyOptional({ example: 'Approved after reviewing account activity.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}
