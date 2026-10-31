import {
  ApiProperty,
  ApiPropertyOptional,
  ApiHideProperty,
} from '@nestjs/swagger';
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

export function mapTournamentFormat(val: any): TournamentFormat | undefined {
  if (!val) return undefined;
  const str = String(val).trim();
  const map: Record<string, TournamentFormat> = {
    'Single Elimination': TournamentFormat.SINGLE_ELIMINATION,
    SINGLE_ELIMINATION: TournamentFormat.SINGLE_ELIMINATION,
    'Double Elimination': TournamentFormat.DOUBLE_ELIMINATION,
    DOUBLE_ELIMINATION: TournamentFormat.DOUBLE_ELIMINATION,
    League: TournamentFormat.LEAGUE,
    LEAGUE: TournamentFormat.LEAGUE,
    'League (Double)': TournamentFormat.LEAGUE_DOUBLE,
    LEAGUE_DOUBLE: TournamentFormat.LEAGUE_DOUBLE,
    'League & Knockout': TournamentFormat.LEAGUE_AND_KNOCKOUT,
    'League & Knockout (Double)': TournamentFormat.LEAGUE_AND_KNOCKOUT_DOUBLE,
    LEAGUE_AND_KNOCKOUT: TournamentFormat.LEAGUE_AND_KNOCKOUT,
    LEAGUE_AND_KNOCKOUT_DOUBLE: TournamentFormat.LEAGUE_AND_KNOCKOUT_DOUBLE,
  };
  return map[str] || (TournamentFormat as any)[str];
}

export function mapPrizeRule(val: any): PrizeRule | undefined {
  if (!val) return undefined;
  const upper = String(val).toUpperCase();
  if (upper === 'FIXED' || upper === 'FIXED_AMOUNT')
    return PrizeRule.FIXED_AMOUNT;
  return PrizeRule.PERCENTAGE;
}

export function mapRegistrationMode(val: any): RegistrationCutOffMode {
  if (!val) return RegistrationCutOffMode.CAPACITY;
  const upper = String(val).toUpperCase();
  if (upper === 'DEADLINE') return RegistrationCutOffMode.DEADLINE;
  if (upper === 'BOTH') return RegistrationCutOffMode.BOTH;
  if (upper === 'MANUAL') return RegistrationCutOffMode.MANUAL;
  return RegistrationCutOffMode.CAPACITY;
}

export function mapFrequencyStatus(val: any): FrequencyStatus {
  if (!val) return FrequencyStatus.DAILY;
  const upper = String(val).toUpperCase();
  if (upper === 'WEEKLY') return FrequencyStatus.WEEKLY;
  if (upper === 'MONTHLY') return FrequencyStatus.MONTHLY;
  return FrequencyStatus.DAILY;
}

export function mapCurrency(val: any): Currency {
  if (!val) return Currency.NGN;
  const upper = String(val).toUpperCase();
  if (upper === 'USD') return Currency.USD;
  if (upper === 'GBP') return Currency.GBP;
  return Currency.NGN;
}

export class CreateTournamentDto {
  @ApiProperty({
    description: 'Tournament Name',
    example: 'Summer Kickoff Classic',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Game Title',
    example: 'EAFC 25',
    default: 'EAFC 25',
  })
  @Transform(({ value, obj }) => value || obj?.game || 'EAFC 25')
  @IsString()
  @IsOptional()
  gameTitle?: string;

  @ApiPropertyOptional({ description: 'Game Title Alias', example: 'EAFC 25' })
  @IsOptional()
  @IsString()
  game?: string;

  // Frontend canonical format string
  @ApiPropertyOptional({
    description:
      'Tournament format (Frontend Canonical: Single Elimination, League, etc.)',
    example: 'Single Elimination',
  })
  @IsOptional()
  @IsString()
  format?: string;

  // Backend Prisma format enum
  @ApiPropertyOptional({
    description: 'Tournament Format (Prisma enum)',
    enum: TournamentFormat,
    example: TournamentFormat.SINGLE_ELIMINATION,
  })
  @Transform(({ value, obj }) => {
    return (
      mapTournamentFormat(value) ||
      mapTournamentFormat(obj?.format) ||
      TournamentFormat.SINGLE_ELIMINATION
    );
  })
  @IsEnum(TournamentFormat)
  @IsOptional()
  tournamentFormat?: TournamentFormat;

  // Frontend canonical teams capacity
  @ApiPropertyOptional({
    description: 'Number of teams (Frontend Canonical)',
    example: 16,
  })
  @IsOptional()
  teams?: number;

  // Backend Prisma numberOfTeams
  @ApiPropertyOptional({
    description: 'Number of teams (Prisma)',
    example: 16,
    default: 16,
  })
  @Transform(({ value, obj }) => {
    const raw =
      value !== undefined && value !== ''
        ? value
        : obj?.teams !== undefined
          ? obj.teams
          : 16;
    const n = Number(raw);
    return isNaN(n) || n < 2 ? 16 : n;
  })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @IsOptional()
  numberOfTeams?: number;

  @ApiPropertyOptional({
    description: 'Entry Fee amount',
    example: 50,
    default: 0,
  })
  @Transform(({ value }) => {
    const n = Number(value);
    return isNaN(n) ? 0 : n;
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  entryFee?: number;

  @ApiPropertyOptional({
    description: 'Currency',
    enum: Currency,
    default: Currency.NGN,
  })
  @Transform(({ value }) => mapCurrency(value))
  @IsEnum(Currency)
  @IsOptional()
  currency?: Currency;

  // Frontend canonical paymentWindowHours
  @ApiPropertyOptional({
    description: 'Payment window in hours (Frontend Canonical)',
    example: 24,
  })
  @IsOptional()
  paymentWindowHours?: number;

  // Backend Prisma paymentWindow
  @ApiPropertyOptional({
    description: 'Payment window in hours (Prisma)',
    example: 24,
    default: 24,
  })
  @Transform(({ value, obj }) => {
    const raw =
      value !== undefined && value !== ''
        ? value
        : obj?.paymentWindowHours !== undefined
          ? obj.paymentWindowHours
          : 24;
    const n = Number(raw);
    return isNaN(n) || n < 1 ? 24 : n;
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  paymentWindow?: number;

  // Frontend canonical prizePoolConfig
  @ApiPropertyOptional({
    description:
      'Prize pool config { type: "percentage" | "fixed", value: number }',
    example: { type: 'percentage', value: 70 },
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        /* ignore invalid JSON string */
      }
    }
    return value;
  })
  @IsOptional()
  prizePoolConfig?: any;

  // Backend Prisma prizeRule (Hidden from Swagger Payload)
  @ApiHideProperty()
  @Transform(({ value, obj }) => {
    if (value) return mapPrizeRule(value);
    if (obj?.prizePoolConfig?.type)
      return mapPrizeRule(obj.prizePoolConfig.type);
    return PrizeRule.PERCENTAGE;
  })
  @IsEnum(PrizeRule)
  @IsOptional()
  prizeRule?: PrizeRule;

  // Backend Prisma percentage (Hidden from Swagger Payload)
  @ApiHideProperty()
  @Transform(({ value, obj }) => {
    if (value !== undefined && value !== '') return Number(value);
    if (obj?.prizePoolConfig?.value !== undefined)
      return Number(obj.prizePoolConfig.value);
    return 70;
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  percentage?: number;

  // Frontend canonical houseRakePercent (Hidden from Swagger Payload)
  @ApiHideProperty()
  @IsOptional()
  houseRakePercent?: number;

  // Backend Prisma houseRake (Hidden from Swagger Payload)
  @ApiHideProperty()
  @Transform(({ value, obj }) => {
    if (value !== undefined && value !== '') return Number(value);
    if (obj?.houseRakePercent !== undefined)
      return Number(obj.houseRakePercent);
    return 30;
  })
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

  // Frontend canonical registrationMode
  @ApiPropertyOptional({
    description: 'Registration mode (Frontend Canonical: CAPACITY or DEADLINE)',
    example: 'CAPACITY',
  })
  @IsOptional()
  registrationMode?: string;

  // Backend Prisma registrationCutOffMode
  @ApiPropertyOptional({
    description: 'Registration Cutoff Mode (Prisma)',
    enum: RegistrationCutOffMode,
    default: RegistrationCutOffMode.CAPACITY,
  })
  @Transform(({ value, obj }) => {
    return mapRegistrationMode(value || obj?.registrationMode);
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
  @Transform(({ value }) => {
    if (!value) return SchedulingMode.MANUAL;
    const upper = String(value).toUpperCase();
    return (SchedulingMode as any)[upper] || SchedulingMode.MANUAL;
  })
  @IsEnum(SchedulingMode)
  @IsOptional()
  schedulingMode?: SchedulingMode;

  // Frontend canonical scheduleSettings object
  @ApiPropertyOptional({
    description: 'Frontend scheduleSettings object',
    example: {
      startDate: '2026-11-15',
      eventStartTime: '11:00',
      eventEndTime: '18:00',
      slotDuration: 25,
      turnoverDuration: 5,
      thirdPlacePlayoffEnabled: true,
      grandFinalResetEnabled: false,
    },
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        /* ignore invalid JSON string */
      }
    }
    return value;
  })
  @IsOptional()
  scheduleSettings?: any;

  // Start Date
  @ApiPropertyOptional({
    description: 'Start Date (UTC ISO string)',
    example: '2026-10-01T10:00:00.000Z',
  })
  @Transform(({ value, obj }) => {
    const raw = value || obj?.scheduleSettings?.startDate;
    if (!raw) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString();
    }
    const date = new Date(raw);
    return isNaN(date.getTime())
      ? new Date().toISOString()
      : date.toISOString();
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  // Deadline date
  @ApiPropertyOptional({
    description: 'Registration Deadline (UTC ISO string)',
    example: '2026-09-30T23:59:59.000Z',
  })
  @Transform(({ value, obj }) => {
    const raw = value || obj?.deadlineDate;
    if (!raw) {
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 7);
      return defaultDate.toISOString();
    }
    const date = new Date(raw);
    return isNaN(date.getTime())
      ? new Date().toISOString()
      : date.toISOString();
  })
  @IsDateString()
  @IsOptional()
  deadline?: string;

  // Frontend canonical deadlineDate
  @ApiPropertyOptional({
    description: 'Registration Deadline Date (Frontend Canonical)',
    example: '2026-09-30T23:59:59.000Z',
  })
  @IsOptional()
  deadlineDate?: string;

  // Frontend canonical maxCapacity
  @ApiPropertyOptional({
    description: 'Max Capacity (Frontend Canonical)',
    example: 16,
  })
  @IsOptional()
  maxCapacity?: number;

  // Backend Prisma capacity
  @ApiPropertyOptional({
    description: 'Tournament Capacity (Prisma)',
    example: 16,
    default: 16,
  })
  @Transform(({ value, obj }) => {
    const raw =
      value !== undefined && value !== ''
        ? value
        : obj?.maxCapacity !== undefined
          ? obj.maxCapacity
          : obj?.teams !== undefined
            ? obj.teams
            : obj?.numberOfTeams;
    const n = Number(raw);
    return isNaN(n) || n < 1 ? 16 : n;
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  capacity?: number;

  @ApiPropertyOptional({
    description: 'Daily Start Time',
    example: '10:00',
    default: '10:00',
  })
  @Transform(
    ({ value, obj }) =>
      value || obj?.scheduleSettings?.eventStartTime || '10:00',
  )
  @IsString()
  @IsOptional()
  dailyStart?: string;

  @ApiPropertyOptional({
    description: 'Daily End Time',
    example: '19:00',
    default: '19:00',
  })
  @Transform(
    ({ value, obj }) => value || obj?.scheduleSettings?.eventEndTime || '19:00',
  )
  @IsString()
  @IsOptional()
  dailyEnd?: string;

  @ApiPropertyOptional({
    description: 'Match duration in minutes',
    example: 25,
    default: 25,
  })
  @Transform(({ value, obj }) => {
    const raw =
      value !== undefined && value !== ''
        ? value
        : obj?.scheduleSettings?.slotDuration;
    const n = Number(raw);
    return isNaN(n) || n < 1 ? 25 : n;
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  matchDuration?: number;

  @ApiPropertyOptional({
    description: 'Turnover duration between matches in minutes',
    example: 5,
    default: 5,
  })
  @Transform(({ value, obj }) => {
    const raw =
      value !== undefined && value !== ''
        ? value
        : obj?.scheduleSettings?.turnoverDuration;
    const n = Number(raw);
    return isNaN(n) || n < 0 ? 5 : n;
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  turnoverDuration?: number;

  @ApiPropertyOptional({ description: 'Lunch break time', example: '13:00' })
  @Transform(
    ({ value, obj }) => value || obj?.scheduleSettings?.lunchBreakStartTime,
  )
  @IsString()
  @IsOptional()
  lunchBreakTime?: string;

  @ApiPropertyOptional({
    description: 'Lunch break duration in minutes',
    example: 60,
  })
  @Transform(({ value, obj }) => {
    const raw =
      value !== undefined && value !== ''
        ? value
        : obj?.scheduleSettings?.lunchBreakDuration;
    return raw !== undefined && raw !== '' ? Number(raw) : undefined;
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  lunchDuration?: number;

  // Frontend canonical frequencySettings object
  @ApiPropertyOptional({
    description: 'Frontend frequencySettings object',
    example: { frequency: 'Daily', buffer: 1, playingDays: [0, 6] },
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        /* ignore invalid JSON string */
      }
    }
    return value;
  })
  @IsOptional()
  frequencySettings?: any;

  @ApiPropertyOptional({ description: 'Buffer days', example: 0, default: 0 })
  @Transform(({ value, obj }) => {
    const raw =
      value !== undefined && value !== ''
        ? value
        : obj?.frequencySettings?.buffer;
    const n = Number(raw);
    return isNaN(n) || n < 0 ? 0 : n;
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  buffer?: number;

  @ApiPropertyOptional({
    description: 'Frequency status',
    enum: FrequencyStatus,
    default: FrequencyStatus.DAILY,
  })
  @Transform(({ value, obj }) => {
    return mapFrequencyStatus(value || obj?.frequencySettings?.frequency);
  })
  @IsEnum(FrequencyStatus)
  @IsOptional()
  frequencyStatus?: FrequencyStatus;

  @ApiPropertyOptional({
    description: 'Days of the week array',
    example: ['Sun', 'Mon', 'Tue'],
    type: [String],
    default: [],
  })
  @Transform(({ value, obj }) => {
    const raw =
      value !== undefined ? value : obj?.frequencySettings?.playingDays;
    if (!raw) return [];
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
      } catch {
        return raw.split(',').map((s: string) => s.trim());
      }
    }
    return Array.isArray(raw) ? raw.map(String) : [String(raw)];
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
    default: TournamentStatus.REGISTRATION_OPEN,
  })
  @Transform(({ value, obj }) => {
    if (obj?.isDraft === true) return TournamentStatus.DRAFT;
    if (value) {
      const upper = String(value).toUpperCase();
      return (
        (TournamentStatus as any)[upper] || TournamentStatus.REGISTRATION_OPEN
      );
    }
    return TournamentStatus.REGISTRATION_OPEN;
  })
  @IsEnum(TournamentStatus)
  @IsOptional()
  status?: TournamentStatus;

  @ApiPropertyOptional({
    description: 'Flag to save tournament as DRAFT',
    example: false,
  })
  @IsOptional()
  isDraft?: boolean;

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
  termsAndConditions?: any;

  // Backward compatibility alias (hidden from Swagger)
  @ApiHideProperty()
  @Transform(({ value }) => normalizeStringArray(value))
  @IsOptional()
  tsAndTc?: any;

  // Direct URLs removed from Swagger Payload
  @ApiHideProperty()
  @IsOptional()
  rulesUrl?: string;

  @ApiHideProperty()
  @IsOptional()
  termsAndConditionsUrl?: string;

  // Media / Logo File Upload Fields
  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Tournament logo image file (choose file)',
  })
  @IsOptional()
  logo?: any;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Organizer logo image file (choose file)',
  })
  @IsOptional()
  organizerLogo?: any;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Secondary organizer logo image file (choose file)',
  })
  @IsOptional()
  secondaryOrganizerLogo?: any;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Fan pass art image file (choose file)',
  })
  @IsOptional()
  fanPassArtUrl?: any;

  @ApiPropertyOptional({
    description: 'Venues with screens',
    type: [CreateVenueDto],
  })
  @Transform(({ value }) => {
    if (!value) return [];
    let parsed = value;
    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value);
      } catch {
        return [];
      }
    }
    if (!Array.isArray(parsed)) parsed = [parsed];
    return parsed.map((item: any) => {
      if (typeof item === 'string') return item;
      const screens =
        item.screens && Array.isArray(item.screens)
          ? item.screens.map((s: any) =>
              typeof s === 'string' ? s : s.name || s.screenName || 'Screen',
            )
          : [];
      return {
        name: item.name || 'Venue',
        address: item.address || '',
        screens,
      };
    });
  })
  @IsOptional()
  venues?: CreateVenueDto[] | Record<string, any>[];

  @ApiPropertyOptional({
    description: 'Sponsors',
    type: [CreateSponsorDto],
  })
  @Transform(({ value }) => {
    if (!value) return [];
    let parsed = value;
    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value);
      } catch {
        return [];
      }
    }
    if (!Array.isArray(parsed)) parsed = [parsed];
    return parsed.map((item: any) => {
      if (typeof item === 'string') return item;
      return {
        name: item.name || 'Sponsor',
        logo: item.logo || item.logoUrl,
        website: item.website,
        value:
          item.value !== undefined
            ? Number(item.value)
            : item.contractValue !== undefined
              ? Number(item.contractValue)
              : undefined,
        priority:
          item.priority || (item.priorityOrder === 1 ? 'GOLD' : 'SILVER'),
      };
    });
  })
  @IsOptional()
  sponsors?: CreateSponsorDto[] | Record<string, any>[];

  // Frontend canonical eventCosts
  @ApiPropertyOptional({ description: 'Event Costs (Frontend Canonical)' })
  @IsOptional()
  eventCosts?: any;

  // Backend Prisma manageEventCosts
  @ApiPropertyOptional({
    description: 'Event Costs (Prisma)',
    type: [CreateManageEventCostDto],
  })
  @Transform(({ value, obj }) => {
    const raw = value || obj?.eventCosts;
    if (!raw) return [];
    let parsed = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return [];
      }
    }
    if (!Array.isArray(parsed)) parsed = [parsed];
    return parsed.map((item: any) => {
      if (typeof item === 'string') return item;
      return {
        costCategory: item.costCategory || item.category || 'Cost',
        amount: Number(item.amount) || 0,
      };
    });
  })
  @IsOptional()
  manageEventCosts?: CreateManageEventCostDto[] | Record<string, any>[];

  // Frontend canonical prizePayouts
  @ApiPropertyOptional({ description: 'Prize payouts (Frontend Canonical)' })
  @IsOptional()
  prizePayouts?: any;

  // Backend Prisma manageEventPrizes
  @ApiPropertyOptional({
    description: 'Event Prizes (Prisma)',
    type: [CreateManageEventPrizeDto],
  })
  @Transform(({ value, obj }) => {
    const raw = value || obj?.prizePayouts;
    if (!raw) return [];
    let parsed = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return [];
      }
    }
    if (!Array.isArray(parsed)) parsed = [parsed];
    return parsed.map((item: any) => {
      if (typeof item === 'string') return item;
      return {
        prizeCategory: item.prizeCategory || item.category || 'Prize',
        amount: Number(item.amount) || 0,
      };
    });
  })
  @IsOptional()
  manageEventPrizes?: CreateManageEventPrizeDto[] | Record<string, any>[];

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
  @Transform(({ value, obj }) => {
    if (value !== undefined) return value === 'true' || value === true;
    if (obj?.scheduleSettings?.thirdPlacePlayoffEnabled !== undefined) {
      return (
        obj.scheduleSettings.thirdPlacePlayoffEnabled === true ||
        obj.scheduleSettings.thirdPlacePlayoffEnabled === 'true'
      );
    }
    return true;
  })
  @IsBoolean()
  @IsOptional()
  thirdPlacePlayoffEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Require jersey size', default: false })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  requireJerseySize?: boolean;

  @ApiPropertyOptional({ description: 'Linked Series ID' })
  @IsOptional()
  @IsString()
  seriesId?: string;

  @ApiPropertyOptional({ description: 'Linked Group ID' })
  @IsOptional()
  @IsString()
  groupId?: string;

  @ApiPropertyOptional({ description: 'Scheduling window open flag' })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === 'true' || value === true;
  })
  @IsOptional()
  @IsBoolean()
  schedulingWindowOpen?: boolean;

  @ApiPropertyOptional({ description: 'Registration open flag' })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === 'true' || value === true;
  })
  @IsOptional()
  @IsBoolean()
  registrationOpen?: boolean;

  @ApiPropertyOptional({ description: 'Top qualifiers count' })
  @IsOptional()
  topQualifiers?: number;

  @ApiPropertyOptional({ description: 'Seeding mode' })
  @IsOptional()
  seedingMode?: string;

  @ApiPropertyOptional({ description: 'Structure locked flag' })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === 'true' || value === true;
  })
  @IsOptional()
  @IsBoolean()
  isStructureLocked?: boolean;

  @ApiPropertyOptional({ description: 'Frontend schedule array' })
  @IsOptional()
  schedule?: any;

  @ApiPropertyOptional({ description: 'Frontend registrations list' })
  @IsOptional()
  registrations?: any;

  @ApiPropertyOptional({ description: 'Frontend rounds array' })
  @IsOptional()
  rounds?: any;

  @ApiPropertyOptional({ description: 'Frontend matches array' })
  @IsOptional()
  matches?: any;

  @ApiPropertyOptional({ description: 'Frontend slots array' })
  @IsOptional()
  slots?: any;

  @ApiPropertyOptional({ description: 'Frontend seeds array' })
  @IsOptional()
  seeds?: any;

  @ApiPropertyOptional({ description: 'Frontend groups array' })
  @IsOptional()
  groups?: any;
}
