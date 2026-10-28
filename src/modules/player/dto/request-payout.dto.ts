import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RequestPayoutDto {
  @ApiProperty({
    description: '10-digit NUBAN Bank Account Number (NIBSS Nigeria standard)',
    example: '0123456789',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10}$/, {
    message:
      'Bank account number must be a valid 10-digit NUBAN card/account number',
  })
  bankAccount: string;

  @ApiProperty({
    description: 'Payout withdrawal amount in Naira (₦)',
    example: 5000,
    minimum: 1000,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'Withdrawal amount must be a valid number' })
  @Min(1000, { message: 'Minimum payout amount limit is ₦1,000' })
  amount: number;

  @ApiPropertyOptional({
    description: 'NIBSS Bank Code (optional 3-digit routing code)',
    example: '058',
  })
  @IsString()
  @IsOptional()
  bankCode?: string;

  @ApiPropertyOptional({
    description:
      'Bank institution name (e.g., GTBank, Access Bank, Zenith Bank)',
    example: 'Guaranty Trust Bank',
  })
  @IsString()
  @IsOptional()
  bankName?: string;

  @ApiPropertyOptional({
    description: 'Beneficiary account holder name',
    example: 'Alex Mercer',
  })
  @IsString()
  @IsOptional()
  accountName?: string;
}
