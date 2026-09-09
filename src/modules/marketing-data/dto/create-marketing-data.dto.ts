import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsIn, IsUUID } from 'class-validator';
import { RegisterAs } from '@prisma/client';

export class CreateMarketingDataDto {
  @ApiPropertyOptional({ description: 'Fan ID (Optional)' })
  @IsOptional()
  @IsUUID()
  fanId?: string;

  @ApiPropertyOptional({ description: 'Player ID (Optional)' })
  @IsOptional()
  @IsUUID()
  playerId?: string;

  @ApiProperty({ description: 'Gamer Tag' })
  @IsString()
  @IsNotEmpty()
  gamerTag: string;

  @ApiProperty({ description: 'Favorite Game Console' })
  @IsString()
  @IsNotEmpty()
  favoriteGameConsole: string;

  @ApiProperty({ description: 'Favorite Football Game' })
  @IsString()
  @IsNotEmpty()
  favoriteFootballGame: string;

  @ApiProperty({ description: 'Register As', enum: RegisterAs })
  @IsNotEmpty()
  @IsIn([RegisterAs.FRIEND, RegisterAs.PLAYER])
  registerAs: RegisterAs;

  @ApiPropertyOptional({ description: 'Instagram Link Username' })
  @IsOptional()
  @IsString()
  instagramLink?: string;

  @ApiPropertyOptional({ description: 'Facebook Link Username' })
  @IsOptional()
  @IsString()
  facebookLink?: string;

  @ApiPropertyOptional({ description: 'TikTok Link Username' })
  @IsOptional()
  @IsString()
  tiktokLink?: string;

  @ApiPropertyOptional({ description: 'X Link Username' })
  @IsOptional()
  @IsString()
  xLink?: string;

  @ApiPropertyOptional({ description: 'YouTube Link Username' })
  @IsOptional()
  @IsString()
  youtubeLink?: string;

  @ApiPropertyOptional({ description: 'Instagram Full URL' })
  @IsOptional()
  @IsString()
  instagramLinkUrl?: string;

  @ApiPropertyOptional({ description: 'Facebook Full URL' })
  @IsOptional()
  @IsString()
  facebookLinkUrl?: string;

  @ApiPropertyOptional({ description: 'TikTok Full URL' })
  @IsOptional()
  @IsString()
  tiktokLinkUrl?: string;

  @ApiPropertyOptional({ description: 'X Full URL' })
  @IsOptional()
  @IsString()
  xLinkUrl?: string;

  @ApiPropertyOptional({ description: 'YouTube Full URL' })
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
}
