import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CompleteFanTournamentApplicationDto {
  @ApiProperty({ example: 'SamTheGamer' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  gamerTag: string;

  @ApiPropertyOptional({ example: 'PlayStation 5' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  preferredPlatform?: string;

  @ApiPropertyOptional({ example: 'Real Madrid' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  favoriteTeam?: string;

  @ApiPropertyOptional({ description: 'Base64 JPEG, PNG, GIF or WebP image; uploaded to AWS S3' })
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  profilePicture?: string;
}
