import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { SeriesPublicationStatus } from '@prisma/client';

export class UpdateSeriesPublicationDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ example: 'tape-national-circuit-2026' })
  @IsString()
  @IsNotEmpty()
  publicSlug: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  leaderboardEnabled?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  liveUpdatesEnabled?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showSeriesLogo?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showCoverImage?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showSeriesDescription?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showSeriesDates?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showTournamentList?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showUpcomingTournament?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showCompletedTournamentResults?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showLeaderboard?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showParticipantProfiles?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showPointsBreakdown?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showRankMovement?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showTournamentPoints?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showSponsors?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showVenueInfo?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showLastUpdatedTime?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showChampion?: boolean;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  leaderboardLimit?: number;

  @ApiPropertyOptional({ example: 'dark', enum: ['dark', 'light'] })
  @IsOptional()
  @IsString()
  embedTheme?: 'dark' | 'light';

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  embedCompact?: boolean;

  @ApiPropertyOptional({
    enum: SeriesPublicationStatus,
    example: SeriesPublicationStatus.PUBLISHED,
  })
  @IsOptional()
  @IsEnum(SeriesPublicationStatus)
  status?: SeriesPublicationStatus;
}
