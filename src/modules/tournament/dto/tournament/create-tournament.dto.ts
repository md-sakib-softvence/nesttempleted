import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
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
import { CreateSponsorDto } from '../sponsor/create-sponsor.dto';
import { CreateVenueDto } from '../venue/create-venue.dto';
import { CreateManageEventCostDto } from '../manage-event-cost/create-manage-event-cost.dto';
import { CreateManageEventPrizeDto } from '../manage-event-prize/create-manage-event-prize.dto';
import { normalizeStringArray } from '../../utils/file-upload.util';

export class CreateTournamentDto {
  @ApiProperty({
    description: 'Tournament Name',
    example: 'Summer Kickoff Classic',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Game Title', example: 'EAFC 25' })
  @IsString()
  @IsNotEmpty()
  gameTitle: string;

  @ApiProperty({
    description: 'Tournament Format',
    enum: TournamentFormat,
    example: TournamentFormat.LEAGUE,
  })
  @IsEnum(TournamentFormat)
  tournamentFormat: TournamentFormat;

  @ApiProperty({ description: 'Number of teams or players', example: 8 })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  numberOfTeams: number;

  @ApiProperty({ description: 'Entry Fee amount', example: 50 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  entryFee: number;

  @ApiProperty({
    description: 'Currency',
    enum: Currency,
    example: Currency.USD,
  })
  @IsEnum(Currency)
  currency: Currency;

  @ApiProperty({ description: 'Payment window in hours', example: 48 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  paymentWindow: number;

  @ApiProperty({
    description: 'Prize pool rule',
    enum: PrizeRule,
    example: PrizeRule.PERCENTAGE,
  })
  @IsEnum(PrizeRule)
  prizeRule: PrizeRule;

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

  @ApiPropertyOptional({
    description: 'Coupon creation enabled',
    default: false,
  })
  @Transform(({ value }) => value === 'true' || value === true)
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
    default: SchedulingMode.MANUAL,
    example: SchedulingMode.AUTO_HOME_VENUE,
  })
  @IsEnum(SchedulingMode)
  @IsOptional()
  schedulingMode?: SchedulingMode;

  @ApiProperty({
    description: 'Start Date (UTC ISO string)',
    example: '2026-10-01T10:00:00.000Z',
  })
  @Transform(({ value }) => {
    if (!value) return value;
    const date = new Date(value);
    return isNaN(date.getTime()) ? value : date.toISOString();
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'Registration Deadline (UTC ISO string)',
    example: '2026-09-30T23:59:59.000Z',
  })
  @Transform(({ value }) => {
    if (!value) return value;
    const date = new Date(value);
    return isNaN(date.getTime()) ? value : date.toISOString();
  })
  @IsDateString()
  deadline: string;

  @ApiProperty({ description: 'Tournament Capacity', example: 16 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity: number;

  @ApiProperty({ description: 'Daily Start Time', example: '09:00' })
  @IsString()
  @IsNotEmpty()
  dailyStart: string;

  @ApiProperty({ description: 'Daily End Time', example: '18:00' })
  @IsString()
  @IsNotEmpty()
  dailyEnd: string;

  @ApiProperty({ description: 'Match duration in minutes', example: 15 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  matchDuration: number;

  @ApiProperty({
    description: 'Turnover duration between matches in minutes',
    example: 5,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  turnoverDuration: number;

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

  @ApiProperty({ description: 'Buffer days', example: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  buffer: number;

  @ApiProperty({
    description: 'Frequency status',
    enum: FrequencyStatus,
    example: FrequencyStatus.DAILY,
  })
  @IsEnum(FrequencyStatus)
  frequencyStatus: FrequencyStatus;

  @ApiPropertyOptional({
    description: 'Days of the week array (JSON string or array)',
    example: ['Sun', 'Mon', 'Tue'],
    type: [String],
    default: [],
  })
  @Transform(({ value }) => {
    if (!value) return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return value.split(',').map((s: string) => s.trim());
      }
    }
    return Array.isArray(value) ? value : [value];
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
    default: TournamentStatus.UPCOMING,
  })
  @IsEnum(TournamentStatus)
  @IsOptional()
  status?: TournamentStatus;

  // File Upload Fields (Swagger documentation)
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
  @Transform(({ value }) => normalizeStringArray(value))
  @IsOptional()
  rules?: any;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Terms & Conditions document files',
  })
  @Transform(({ value }) => normalizeStringArray(value))
  @IsOptional()
  tsAndTc?: any;

  @ApiPropertyOptional({
    description:
      'Venues with screens to create and link with this tournament (array of full venue objects, JSON string, or array of venue IDs)',
    type: [CreateVenueDto],
    example: [
      {
        name: 'Main Arena',
        address: '123 Esports Blvd, Lagos',
        screens: ['Screen 1', 'Screen 2'],
      },
    ],
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [value];
      }
    }
    return Array.isArray(value) ? value : value ? [value] : [];
  })
  @IsOptional()
  venues?: CreateVenueDto[] | any;

  @ApiPropertyOptional({
    description:
      'Sponsors to create and link with this tournament (array of full sponsor objects or JSON string)',
    type: [CreateSponsorDto],
    example: [
      {
        name: 'Red Bull',
        logo: 'https://example.com/logo.png',
        website: 'https://redbull.com',
        priority: 'PRIMARY',
        contact: 'sponsor@redbull.com',
        value: 10000,
        status: 'BOTH',
      },
    ],
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [value];
      }
    }
    return Array.isArray(value) ? value : value ? [value] : [];
  })
  @IsOptional()
  sponsors?: CreateSponsorDto[] | any;

  @ApiPropertyOptional({
    description:
      'Event Costs to create and link with this tournament (array of full cost objects or JSON string)',
    type: [CreateManageEventCostDto],
    example: [
      {
        costCategory: 'Venue Rental',
        amount: 500,
      },
    ],
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [value];
      }
    }
    return Array.isArray(value) ? value : value ? [value] : [];
  })
  @IsOptional()
  manageEventCosts?: CreateManageEventCostDto[] | any;

  @ApiPropertyOptional({
    description:
      'Event Prizes to create and link with this tournament (array of full prize objects or JSON string)',
    type: [CreateManageEventPrizeDto],
    example: [
      {
        prizeCategory: '1st Place Winner',
        amount: 1000,
      },
    ],
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [value];
      }
    }
    return Array.isArray(value) ? value : value ? [value] : [];
  })
  @IsOptional()
  manageEventPrizes?: CreateManageEventPrizeDto[] | any;

  @ApiPropertyOptional({
    description:
      'List of participating player IDs or participants (JSON string or array)',
    example: ['player-uuid-1', 'player-uuid-2'],
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  })
  @IsOptional()
  playerIds?: any;

  @ApiPropertyOptional({
    description: 'Number of groups (for LEAGUE_AND_KNOCKOUT formats)',
    example: 4,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  groupsCount?: number;

  @ApiPropertyOptional({
    description: 'Enable 3rd place playoff match',
    default: true,
  })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  thirdPlacePlayoffEnabled?: boolean;
}
