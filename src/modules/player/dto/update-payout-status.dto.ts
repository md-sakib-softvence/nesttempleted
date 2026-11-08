import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewPayoutDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ description: 'Required when rejecting a request' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}

export class StartPayoutProcessingDto {
  @ApiProperty({ description: 'Reference from the bank transfer initiated by clearing' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  transferReference: string;
}

export class CompletePayoutDto extends StartPayoutProcessingDto {}

export class FailPayoutDto {
  @ApiProperty({ description: 'Reason the transfer failed' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
