import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class CreateSeriesAdjustmentDto {
  @ApiProperty({
    description: 'Series participant ID',
    example: 'sp-01',
  })
  @IsString()
  @IsNotEmpty()
  participantId: string;

  @ApiProperty({
    description: 'Points to add or deduct (+ or -)',
    example: -10,
  })
  @IsInt()
  points: number;

  @ApiProperty({
    description: 'Administrative reason for adjustment',
    example: 'Late arrival penalty during tournament round 2.',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
