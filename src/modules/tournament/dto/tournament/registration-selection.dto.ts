import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum SelectionMode {
  MANUAL = 'manual',
  FIRST_IN = 'first_in',
  RANDOM = 'random',
}

export class RegistrationSelectionDto {
  @ApiProperty({ enum: SelectionMode, example: SelectionMode.MANUAL })
  @IsEnum(SelectionMode)
  @IsNotEmpty()
  mode: SelectionMode;

  @ApiPropertyOptional({
    type: [String],
    description: 'Array of registration IDs to select (required if mode is manual)',
    example: ['reg-9921', 'reg-9922'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  registrationIds?: string[];

  @ApiPropertyOptional({
    description: 'Number of registrations to select (for first_in or random)',
    example: 16,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  count?: number;

  @ApiPropertyOptional({
    description: 'Hours granted for completing payment',
    example: 24,
    default: 24,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  paymentWindowHours?: number = 24;

  @ApiPropertyOptional({
    description: 'Expected version for optimistic locking',
    example: 6,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
