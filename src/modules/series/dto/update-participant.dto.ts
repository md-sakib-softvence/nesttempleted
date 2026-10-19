import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import {
  SeriesParticipantStatus,
  SeriesQualificationStatus,
} from '@prisma/client';

export class UpdateSeriesParticipantDto {
  @ApiPropertyOptional({
    enum: SeriesParticipantStatus,
    example: SeriesParticipantStatus.DISQUALIFIED,
  })
  @IsOptional()
  @IsEnum(SeriesParticipantStatus)
  status?: SeriesParticipantStatus;

  @ApiPropertyOptional({
    enum: SeriesQualificationStatus,
    example: SeriesQualificationStatus.QUALIFIED,
  })
  @IsOptional()
  @IsEnum(SeriesQualificationStatus)
  qualificationStatus?: SeriesQualificationStatus;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  approved?: boolean;

  @ApiPropertyOptional({
    example: 'Violation of code of conduct in Event 2.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
