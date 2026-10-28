import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TournamentRegistrationStatus } from '@prisma/client';

export class QueryTournamentRegistrationDto {
  @ApiPropertyOptional({
    description: 'Filter by admin tab',
    enum: ['registered', 'selected', 'confirmed', 'waitlist'],
    example: 'registered',
  })
  @IsOptional()
  @IsString()
  tab?: 'registered' | 'selected' | 'confirmed' | 'waitlist';

  @ApiPropertyOptional({
    enum: TournamentRegistrationStatus,
  })
  @IsOptional()
  @IsEnum(TournamentRegistrationStatus)
  status?: TournamentRegistrationStatus;

  @ApiPropertyOptional({
    description: 'Filter by payment status (PENDING, PAID, etc.)',
    example: 'PENDING',
  })
  @IsOptional()
  @IsString()
  paymentStatus?: string;

  @ApiPropertyOptional({
    description: 'Search player gamerTag, full name, or email',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 25, example: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 25;
}
