import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PhotoModerationStatus } from '@prisma/client';

export class ModeratePlayerPhotoDto {
  @ApiProperty({
    enum: PhotoModerationStatus,
    enumName: 'PhotoModerationStatus',
  })
  @IsEnum(PhotoModerationStatus)
  status: PhotoModerationStatus;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
