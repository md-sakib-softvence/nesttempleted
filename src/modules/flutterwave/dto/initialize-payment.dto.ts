import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsObject,
} from 'class-validator';

export class InitializePaymentDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Customer email address',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 5000,
    description: 'Amount to pay in base currency unit (e.g. 5000)',
  })
  @IsNumber()
  @IsPositive()
  @IsNotEmpty()
  amount: number;

  @ApiPropertyOptional({
    example: 'NGN',
    description: 'Currency code (e.g. NGN, USD, GHS, KES, ZAR, EUR). Defaults to NGN.',
    default: 'NGN',
  })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({
    example: 'John Doe',
    description: 'Customer full name',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    example: '+2348012345678',
    description: 'Customer phone number',
  })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional({
    example: 'FLW-TX-12345678',
    description: 'Optional unique transaction reference. Will be generated automatically if omitted.',
  })
  @IsString()
  @IsOptional()
  txRef?: string;

  @ApiPropertyOptional({
    example: 'https://www.tapegaming.com/payment/callback',
    description: 'Redirect URL where the user will be redirected after completing payment',
  })
  @IsString()
  @IsOptional()
  redirectUrl?: string;

  @ApiPropertyOptional({
    example: 'card,mobilemoney,ussd,banktransfer',
    description: 'Comma separated list of payment options to display',
  })
  @IsString()
  @IsOptional()
  paymentOptions?: string;

  @ApiPropertyOptional({
    example: 'TAPE eSports Tournament Registration',
    description: 'Title of the payment modal',
  })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    example: 'Payment for Pro League Tournament Entry',
    description: 'Description of payment displayed to the customer',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/logo.png',
    description: 'URL of business logo to display in modal',
  })
  @IsString()
  @IsOptional()
  logo?: string;

  @ApiPropertyOptional({
    example: { tournamentId: '123', playerId: '456' },
    description: 'Custom metadata object attached to the transaction',
  })
  @IsObject()
  @IsOptional()
  meta?: Record<string, any>;
}
