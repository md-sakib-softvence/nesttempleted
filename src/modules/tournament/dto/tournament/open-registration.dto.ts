import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, Min } from 'class-validator';
import { RegistrationCutOffMode } from '@prisma/client';
import { Transform, Type } from 'class-transformer';

export class OpenRegistrationDto {
  @ApiProperty({
    description: 'Registration Cutoff Mode',
    enum: RegistrationCutOffMode,
    example: RegistrationCutOffMode.CAPACITY,
  })
  @IsEnum(RegistrationCutOffMode)
  @IsNotEmpty()
  mode: RegistrationCutOffMode;

  @ApiPropertyOptional({ description: 'Max Capacity of players/teams', example: 32 })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @IsOptional()
  capacity?: number;

  @ApiPropertyOptional({
    description: 'Registration Deadline ISO date',
    example: '2026-11-01T23:59:59.000Z',
  })
  @Transform(({ value }) => {
    if (!value) return value;
    const date = new Date(value);
    return isNaN(date.getTime()) ? value : date.toISOString();
  })
  @IsDateString()
  @IsOptional()
  deadline?: string;

  @ApiPropertyOptional({
    description: 'Require Player Shirt / Jersey Size',
    default: false,
  })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  requireJerseySize?: boolean;
}
