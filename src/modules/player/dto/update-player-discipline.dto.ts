import { ApiPropertyOptional } from '@nestjs/swagger';
import { PlayerStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePlayerDisciplineDto {
  @ApiPropertyOptional({ enum: PlayerStatus, enumName: 'PlayerStatus' })
  @IsOptional()
  @IsEnum(PlayerStatus)
  status?: PlayerStatus;

  @ApiPropertyOptional({ maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  moderationNotes?: string | null;
}
