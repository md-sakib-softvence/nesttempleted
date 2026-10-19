import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpdateFinancialCostItemDto {
  @ApiPropertyOptional({ example: 'Venue Rental' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 150000 })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ example: 'paid' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateFinancialPrizeItemDto {
  @ApiPropertyOptional({ example: '1st Place' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 600000 })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ example: 'pending' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateTournamentFinancialsDto {
  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsNumber()
  houseRakePercent?: number;

  @ApiPropertyOptional({ type: [UpdateFinancialCostItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateFinancialCostItemDto)
  eventCosts?: UpdateFinancialCostItemDto[];

  @ApiPropertyOptional({ type: [UpdateFinancialPrizeItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateFinancialPrizeItemDto)
  prizePayouts?: UpdateFinancialPrizeItemDto[];
}
