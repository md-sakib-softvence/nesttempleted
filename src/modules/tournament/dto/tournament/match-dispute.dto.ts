import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateMatchDisputeDto {
  @ApiProperty({
    description: 'Detailed reason for match dispute',
    example: 'Controller disconnection complaint by player 2.',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({
    description: 'Expected Match Version for optimistic concurrency',
    example: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
