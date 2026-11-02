import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TournamentGameType, TournamentStatus } from '@prisma/client';
import { QueryOptions } from '../../../utils/query.util';

export class QueryActiveUpcomingTournamentDto implements QueryOptions {
  @ApiPropertyOptional({ default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10, example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Search tournament name or game title',
    example: 'EAFC',
  })
  @IsOptional()
  @IsString()
  searchTerm?: string;

  @ApiPropertyOptional({
    enum: TournamentStatus,
    description:
      'Optional status filter (e.g. REGISTRATION_OPEN, UPCOMING, ONGOING, IN_PROGRESS). Use "ALL" to return all statuses without filtering.',
  })
  @IsOptional()
  status?: TournamentStatus | 'ALL';

  @ApiPropertyOptional({ enum: TournamentGameType })
  @IsOptional()
  @IsEnum(TournamentGameType)
  gameType?: TournamentGameType;

  @ApiPropertyOptional({
    description: 'Field to sort by (e.g. startDate, name, createdAt)',
    example: 'startDate',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    default: 'asc',
    example: 'asc',
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  [key: string]: unknown;
}
