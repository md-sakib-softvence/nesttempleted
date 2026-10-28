import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { DisputeStatus } from '@prisma/client';

export class UpdateMatchDisputeDto {
  @ApiProperty({
    enum: DisputeStatus,
    example: DisputeStatus.RESOLVED,
  })
  @IsEnum(DisputeStatus)
  @IsNotEmpty()
  resolution: DisputeStatus;

  @ApiPropertyOptional({
    description: 'Administrative resolution details or reasoning',
    example: 'Reviewed official recording; score confirmed valid.',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Expected dispute version for optimistic locking',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
