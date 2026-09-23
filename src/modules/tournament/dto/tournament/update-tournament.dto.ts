import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  TournamentFormat,
  Currency,
  PrizeRule,
  RegistrationCutOffMode,
  FrequencyStatus,
  TournamentStatus,
  SchedulingMode,
} from '@prisma/client';

export class UpdateTournamentDto {
  @ApiPropertyOptional({
    description: 'Tournament Name',
    example: 'Summer Kickoff Classic',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Game Title', example: 'EAFC 25' })
  @IsString()
  @IsOptional()
  gameTitle?: string;

  @ApiPropertyOptional({
    description: 'Tournament Format',
    enum: TournamentFormat,
  })
  @IsEnum(TournamentFormat)
  @IsOptional()
  tournamentFormat?: TournamentFormat;

  @ApiPropertyOptional({
    description: 'Number of teams or players',
    example: 8,
  })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @IsOptional()
  numberOfTeams?: number;

  @ApiPropertyOptional({ description: 'Entry Fee amount', example: 50 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  entryFee?: number;

  @ApiPropertyOptional({
    description: 'Currency',
    enum: Currency,
  })
  @IsEnum(Currency)
  @IsOptional()
  currency?: Currency;

  @ApiPropertyOptional({ description: 'Payment window in hours', example: 48 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  paymentWindow?: number;

  @ApiPropertyOptional({
    description: 'Prize pool rule',
    enum: PrizeRule,
  })
  @IsEnum(PrizeRule)
  @IsOptional()
  prizeRule?: PrizeRule;

  @ApiPropertyOptional({ description: 'Prize pool percentage', example: 80 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  percentage?: number;

  @ApiPropertyOptional({ description: 'House rake percentage', example: 10 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  houseRake?: number;

  @ApiPropertyOptional({ description: 'Coupon creation enabled' })
  @Transform(({ value }) =>
    value !== undefined ? value === 'true' || value === true : undefined,
  )
  @IsBoolean()
  @IsOptional()
  couponCreation?: boolean;

  @ApiPropertyOptional({
    description: 'Registration Cutoff Mode',
    enum: RegistrationCutOffMode,
  })
  @IsEnum(RegistrationCutOffMode)
  @IsOptional()
  registrationCutOffMode?: RegistrationCutOffMode;

  @ApiPropertyOptional({
    description: 'Scheduling Engine Mode',
    enum: SchedulingMode,
    example: SchedulingMode.AUTO_HOME_VENUE,
  })
  @IsEnum(SchedulingMode)
  @IsOptional()
  schedulingMode?: SchedulingMode;

  @ApiPropertyOptional({
    description: 'Tournament Schedule structure (JSON)',
  })
  @IsOptional()
  schedule?: any;

  @ApiPropertyOptional({
    description: 'Start Date (ISO string)',
    example: '2026-10-01T10:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Registration Deadline (ISO string)',
    example: '2026-09-30T23:59:59.000Z',
  })
  @IsDateString()
  @IsOptional()
  deadline?: string;

  @ApiPropertyOptional({ description: 'Tournament Capacity', example: 16 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  capacity?: number;

  @ApiPropertyOptional({ description: 'Daily Start Time', example: '09:00' })
  @IsString()
  @IsOptional()
  dailyStart?: string;

  @ApiPropertyOptional({ description: 'Daily End Time', example: '18:00' })
  @IsString()
  @IsOptional()
  dailyEnd?: string;

  @ApiPropertyOptional({
    description: 'Match duration in minutes',
    example: 15,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  matchDuration?: number;

  @ApiPropertyOptional({
    description: 'Turnover duration between matches in minutes',
    example: 5,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  turnoverDuration?: number;

  @ApiPropertyOptional({ description: 'Lunch break time', example: '13:00' })
  @IsString()
  @IsOptional()
  lunchBreakTime?: string;

  @ApiPropertyOptional({
    description: 'Lunch break duration in minutes',
    example: 60,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  lunchDuration?: number;

  @ApiPropertyOptional({ description: 'Buffer days', example: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  buffer?: number;

  @ApiPropertyOptional({
    description: 'Frequency status',
    enum: FrequencyStatus,
  })
  @IsEnum(FrequencyStatus)
  @IsOptional()
  frequencyStatus?: FrequencyStatus;

  @ApiPropertyOptional({
    description: 'Days of the week array (JSON string or array)',
    type: [String],
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value.split(',').map((s: string) => s.trim());
      }
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  frequencyArray?: string[];

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Player organization URL or file',
    example: 'https://org.com',
  })
  @IsOptional()
  playerOrgUrl?: any;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'PR organization URL or file',
    example: 'https://pr.org.com',
  })
  @IsOptional()
  prOrgUrl?: any;

  @ApiPropertyOptional({
    description: 'Tournament Status',
    enum: TournamentStatus,
  })
  @IsEnum(TournamentStatus)
  @IsOptional()
  status?: TournamentStatus;

  // File Upload Fields
  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Canvas Image file',
  })
  @IsOptional()
  canvasImage?: any;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Tournament Logo file',
  })
  @IsOptional()
  tournamentLogoUrl?: any;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Tournament Logo file (alias)',
  })
  @IsOptional()
  tournamentLogo?: any;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Rules document files',
  })
  @IsOptional()
  rules?: any;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Terms & Conditions document files',
  })
  @IsOptional()
  tsAndTc?: any;
}
