import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PlayerStatus } from '@prisma/client';

export class UpdatePlayerModerationDto {
  @ApiPropertyOptional({
    description: 'Player moderation status',
    enum: PlayerStatus,
    example: PlayerStatus.SUSPENDED,
  })
  @IsOptional()
  @Transform(({ value }) => {
    const normalized = String(value ?? '')
      .trim()
      .toUpperCase();
    if (normalized === 'BANNED') return PlayerStatus.BANNED_PERMANENTLY;
    return normalized;
  })
  @IsEnum(PlayerStatus)
  status?: PlayerStatus;

  @ApiPropertyOptional({
    description: 'Private moderation note; send an empty string to clear it',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  moderationNotes?: string;
}
