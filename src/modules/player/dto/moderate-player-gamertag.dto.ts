import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { GamerTagModerationStatus } from '@prisma/client';

export class ModeratePlayerGamerTagDto {
  @ApiProperty({
    enum: GamerTagModerationStatus,
    enumName: 'GamerTagModerationStatus',
  })
  @IsEnum(GamerTagModerationStatus)
  status: GamerTagModerationStatus;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
