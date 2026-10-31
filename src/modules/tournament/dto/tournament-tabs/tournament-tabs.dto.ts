import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsArray,
} from 'class-validator';
import {
  TournamentFormat,
  Currency,
  PrizeRule,
  RegistrationCutOffMode,
  FrequencyStatus,
  TournamentStatus,
  SchedulingMode,
  RaffleStatus,
  TournamentRegistrationStatus,
} from '@prisma/client';

export class UpdateDetailsTabDto {
  @ApiPropertyOptional({ example: 'Winter Championship 2024' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'EAFC 25' })
  @IsOptional()
  @IsString()
  gameTitle?: string;

  @ApiPropertyOptional({ enum: TournamentFormat })
  @IsOptional()
  @IsEnum(TournamentFormat)
  tournamentFormat?: TournamentFormat;

  @ApiPropertyOptional({ example: 32 })
  @IsOptional()
  @IsNumber()
  capacity?: number;

  @ApiPropertyOptional({ example: 32 })
  @IsOptional()
  @IsNumber()
  numberOfTeams?: number;

  @ApiPropertyOptional({ enum: RegistrationCutOffMode })
  @IsOptional()
  @IsEnum(RegistrationCutOffMode)
  registrationCutOffMode?: RegistrationCutOffMode;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsNumber()
  entryFee?: number;

  @ApiPropertyOptional({ enum: Currency })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ enum: PrizeRule })
  @IsOptional()
  @IsEnum(PrizeRule)
  prizeRule?: PrizeRule;

  @ApiPropertyOptional({ example: 70 })
  @IsOptional()
  @IsNumber()
  percentage?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  houseRake?: number;

  @ApiPropertyOptional({ example: 48 })
  @IsOptional()
  @IsNumber()
  paymentWindow?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deadline?: string;
}

export class UpdateRegistrationsTabDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  registrationOpen?: boolean;

  @ApiPropertyOptional({ enum: RegistrationCutOffMode })
  @IsOptional()
  @IsEnum(RegistrationCutOffMode)
  registrationCutOffMode?: RegistrationCutOffMode;

  @ApiPropertyOptional({ example: 32 })
  @IsOptional()
  @IsNumber()
  capacity?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  requireJerseySize?: boolean;

  @ApiPropertyOptional({ enum: ['open', 'close', 'select'] })
  @IsOptional()
  @IsString()
  action?: 'open' | 'close' | 'select';

  @ApiPropertyOptional({ enum: ['manual', 'first_in', 'random'] })
  @IsOptional()
  @IsString()
  selectionMode?: 'manual' | 'first_in' | 'random';

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  selectedPlayerIds?: string[];
}

export class UpdateScheduleTabDto {
  @ApiPropertyOptional({ enum: SchedulingMode })
  @IsOptional()
  @IsEnum(SchedulingMode)
  schedulingMode?: SchedulingMode;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  schedulingPaused?: boolean;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @IsString()
  dailyStart?: string;

  @ApiPropertyOptional({ example: '21:00' })
  @IsOptional()
  @IsString()
  dailyEnd?: string;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsNumber()
  matchDuration?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  turnoverDuration?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  buffer?: number;

  @ApiPropertyOptional({ example: '13:00' })
  @IsOptional()
  @IsString()
  lunchBreakTime?: string;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsNumber()
  lunchDuration?: number;

  @ApiPropertyOptional({ enum: FrequencyStatus })
  @IsOptional()
  @IsEnum(FrequencyStatus)
  frequencyStatus?: FrequencyStatus;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  frequencyArray?: string[];

  @ApiPropertyOptional({ enum: ['pause', 'resume', 'regenerate'] })
  @IsOptional()
  @IsString()
  action?: 'pause' | 'resume' | 'regenerate';
}

export class UpdateLeaderboardsTabDto {
  @ApiPropertyOptional()
  @IsOptional()
  pointAdjustments?: any;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  rulesVersion?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tieBreakerRule?: string;
}

export class UpdateRafflesTabDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  raffleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prizeDescription?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  numberOfWinners?: number;

  @ApiPropertyOptional({ enum: RaffleStatus })
  @IsOptional()
  @IsEnum(RaffleStatus)
  status?: RaffleStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  drawDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registrationCloseDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  raffles?: any[];
}

export class UpdatePlayerCardTemplateTabDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizerLogo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  playerOrgUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secondaryOrganizerLogo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prOrgUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tournamentLogo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tournamentLogoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  canvasImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  sponsors?: any[];

  @ApiPropertyOptional()
  @IsOptional()
  playerCardTemplate?: any;
}

export class UpdateFanPassTemplateTabDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizerLogo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  playerOrgUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secondaryOrganizerLogo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prOrgUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tournamentLogo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tournamentLogoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fanPassArtUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  canvasImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  sponsors?: any[];

  @ApiPropertyOptional()
  @IsOptional()
  fanPassTemplate?: any;
}

export class UpdateRulesTabDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  rules?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rulesUrl?: string;
}

export class UpdateTermsTabDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  tsAndTc?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  termsAndConditions?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  termsAndConditionsUrl?: string;
}

export class UpdateSettingsTabDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: TournamentFormat })
  @IsOptional()
  @IsEnum(TournamentFormat)
  format?: TournamentFormat;

  @ApiPropertyOptional({ enum: RegistrationCutOffMode })
  @IsOptional()
  @IsEnum(RegistrationCutOffMode)
  registrationMode?: RegistrationCutOffMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxCapacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  capacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deadlineDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ enum: SchedulingMode })
  @IsOptional()
  @IsEnum(SchedulingMode)
  schedulingMode?: SchedulingMode;

  @ApiPropertyOptional()
  @IsOptional()
  scheduleSettings?: any;

  @ApiPropertyOptional()
  @IsOptional()
  frequencySettings?: any;

  @ApiPropertyOptional({ enum: TournamentStatus })
  @IsOptional()
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  venues?: any[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  eventCosts?: any[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  prizePayouts?: any[];
}

export class QueryTabRegistrationsDto {
  @ApiPropertyOptional({ default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ default: 25, example: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 25;

  @ApiPropertyOptional({
    enum: ['registered', 'selected', 'confirmed', 'waitlist'],
  })
  @IsOptional()
  @IsString()
  tab?: 'registered' | 'selected' | 'confirmed' | 'waitlist';

  @ApiPropertyOptional({ enum: TournamentRegistrationStatus })
  @IsOptional()
  @IsEnum(TournamentRegistrationStatus)
  status?: TournamentRegistrationStatus;

  @ApiPropertyOptional({ description: 'Filter by payment status' })
  @IsOptional()
  @IsString()
  paymentStatus?: string;

  @ApiPropertyOptional({ description: 'Search gamerTag, name or email' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class QueryTabScheduleDto {
  @ApiPropertyOptional({ default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ default: 25, example: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 25;

  @ApiPropertyOptional({ description: 'Filter by round' })
  @IsOptional()
  @IsString()
  round?: string;

  @ApiPropertyOptional({ description: 'Filter by match status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by allocated status (true/false)',
  })
  @IsOptional()
  @IsString()
  isAllocated?: string;
}

export class QueryTabLeaderboardsDto {
  @ApiPropertyOptional({ default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ default: 25, example: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 25;

  @ApiPropertyOptional({ description: 'Search player gamertag or name' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class QueryTabRafflesDto {
  @ApiPropertyOptional({ default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ default: 10, example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 10;
}

