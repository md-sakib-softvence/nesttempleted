import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFanDto {
  @ApiProperty({ description: 'First Name' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ description: 'Phone Number' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ description: 'Email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Password' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ description: 'Gender' })
  @IsString()
  @IsNotEmpty()
  gender: string;

  @ApiProperty({ description: 'Age Range' })
  @IsString()
  @IsNotEmpty()
  ageRange: string;

  @ApiPropertyOptional({ description: 'Top Point', type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  topPoint?: number;

  @ApiProperty({ description: 'Favorite Game' })
  @IsString()
  @IsNotEmpty()
  favoriteGame: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Profile Image File',
  })
  @IsOptional()
  profileImage?: any;
}
