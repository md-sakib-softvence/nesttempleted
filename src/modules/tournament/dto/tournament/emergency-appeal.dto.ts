import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class EmergencyAppealDto {
  @ApiPropertyOptional({
    description:
      'Reason for requesting emergency scheduling token / date bypass',
    example: 'Work conflict during scheduled hours, requesting evening slot',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
