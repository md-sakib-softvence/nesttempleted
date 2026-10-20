import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsArray,
  IsObject,
} from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Customer email address',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 5000,
    description: 'Amount to pay in base currency (e.g. 5000 for 5,000 NGN)',
  })
  @IsNumber()
  @IsPositive()
  @IsNotEmpty()
  amount: number;

  @ApiPropertyOptional({
    example: 'XOF',
    description: 'Currency code (e.g. XOF, NGN, USD, GHS, ZAR). Defaults to merchant currency if omitted.',
  })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({
    example: 'ref_1234567890',
    description: 'Optional unique transaction reference',
  })
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiPropertyOptional({
    example: 'https://www.tapegaming.com/payment/callback',
    description: 'Callback URL redirected after payment',
  })
  @IsString()
  @IsOptional()
  callbackUrl?: string;

  @ApiPropertyOptional({
    example: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
    description: 'Allowed payment channels',
  })
  @IsArray()
  @IsOptional()
  channels?: string[];

  @ApiPropertyOptional({
    example: { userId: '123', tournamentId: '456' },
    description: 'Custom metadata object attached to transaction',
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
