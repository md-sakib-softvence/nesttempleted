import { IsOptional, IsString, IsEnum, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TicketStatus, TicketType } from '@prisma/client';

export class QueryTicketDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Filter by tournament ID' })
  @IsString()
  @IsOptional()
  tournamentId?: string;

  @ApiPropertyOptional({ enum: TicketStatus, description: 'Filter by ticket status' })
  @IsEnum(TicketStatus)
  @IsOptional()
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketType, description: 'Filter by ticket type' })
  @IsEnum(TicketType)
  @IsOptional()
  type?: TicketType;

  @ApiPropertyOptional({ description: 'Search by purchaser name, email, or showTicketId' })
  @IsString()
  @IsOptional()
  searchTerm?: string;
}
