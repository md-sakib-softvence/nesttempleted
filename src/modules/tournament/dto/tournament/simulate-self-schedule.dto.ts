import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SimulateSelfScheduleDto {
  @ApiProperty({ description: 'Canonical Match ID to simulate', example: 'm104' })
  @IsNotEmpty()
  @IsString()
  matchId: string;

  @ApiPropertyOptional({
    description: 'Simulated current timestamp (ISO 8601). Defaults to current server time if omitted.',
    example: '2026-10-29T11:00:00Z',
  })
  @IsOptional()
  @IsString()
  simulatedCurrentTime?: string;
}
