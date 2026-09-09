import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { RegisterAs } from '@prisma/client';

export class CreateMarketingDataDto {
  // --- Common Fields for User (Fan/Player) ---
  @ApiProperty({ description: 'First Name' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiPropertyOptional({ description: 'Last Name (Required if PLAYER)' })
  @ValidateIf((o) => o.registerAs === RegisterAs.PLAYER)
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @ApiProperty({ description: 'Email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Password' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ description: 'Phone Number' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  // --- Marketing Data Required Fields ---
  @ApiProperty({ description: 'Gamer Tag' })
  @IsString()
  @IsNotEmpty()
  gamerTag: string;

  @ApiProperty({ description: 'Favorite Game Console / Favorite Game' })
  @IsString()
  @IsNotEmpty()
  favoriteGameConsole: string;

  @ApiProperty({ description: 'Favorite Football Game' })
  @IsString()
  @IsNotEmpty()
  favoriteFootballGame: string;

  @ApiProperty({ description: 'Register As (FRIEND or PLAYER)', enum: RegisterAs })
  @IsEnum(RegisterAs)
  @IsNotEmpty()
  registerAs: RegisterAs;

  @ApiProperty({ description: 'Gender' })
  @IsString()
  @IsNotEmpty()
  gender: string;

  @ApiProperty({ description: 'Age Range (e.g. 18-24)' })
  @IsString()
  @IsNotEmpty()
  ageRange: string;

  // --- Marketing Data Optional Fields ---
  @ApiPropertyOptional({ description: 'Global Record' })
  @IsOptional()
  @IsString()
  globalRecord?: string;

  @ApiPropertyOptional({ description: 'Profession' })
  @IsOptional()
  @IsString()
  profession?: string;

  @ApiPropertyOptional({ description: 'Instagram Link' })
  @IsOptional()
  @IsString()
  instagramLink?: string;

  @ApiPropertyOptional({ description: 'Facebook Link' })
  @IsOptional()
  @IsString()
  facebookLink?: string;

  @ApiPropertyOptional({ description: 'TikTok Link' })
  @IsOptional()
  @IsString()
  tiktokLink?: string;

  @ApiPropertyOptional({ description: 'X (Twitter) Link' })
  @IsOptional()
  @IsString()
  xLink?: string;

  @ApiPropertyOptional({ description: 'YouTube Link' })
  @IsOptional()
  @IsString()
  youtubeLink?: string;

  @ApiPropertyOptional({ description: 'Instagram Link URL' })
  @IsOptional()
  @IsString()
  instagramLinkUrl?: string;

  @ApiPropertyOptional({ description: 'Facebook Link URL' })
  @IsOptional()
  @IsString()
  facebookLinkUrl?: string;

  @ApiPropertyOptional({ description: 'TikTok Link URL' })
  @IsOptional()
  @IsString()
  tiktokLinkUrl?: string;

  @ApiPropertyOptional({ description: 'X (Twitter) Link URL' })
  @IsOptional()
  @IsString()
  xLinkUrl?: string;

  @ApiPropertyOptional({ description: 'YouTube Link URL' })
  @IsOptional()
  @IsString()
  youtubeLinkUrl?: string;

  @ApiPropertyOptional({ description: 'Parent Name' })
  @IsOptional()
  @IsString()
  parentName?: string;

  @ApiPropertyOptional({ description: 'Parent Phone Number' })
  @IsOptional()
  @IsString()
  parentPhoneNumber?: string;

  @ApiPropertyOptional({ description: 'Occupation' })
  @IsOptional()
  @IsString()
  occupation?: string;

  @ApiPropertyOptional({ description: 'Area' })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({ description: 'Employee ID responsible for this data' })
  @IsOptional()
  @IsString()
  employeeId?: string;
}
