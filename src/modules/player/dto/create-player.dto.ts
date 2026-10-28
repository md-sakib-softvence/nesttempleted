import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePlayerDto {
  @ApiProperty({ description: 'First Name', example: 'Alex' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ description: 'Last Name', example: 'Mercer' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ description: 'Email', example: 'player@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Password' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ description: 'Phone Number', example: '+1234567890' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiPropertyOptional({
    description: 'Gamer Tag / In-game Alias',
    example: 'PRO_SLAYER',
  })
  @IsString()
  @IsOptional()
  gamerTag?: string;

  @ApiPropertyOptional({
    description: 'Gamer Tag alias',
    example: 'PRO_SLAYER',
  })
  @IsString()
  @IsOptional()
  gamertag?: string;

  @ApiPropertyOptional({
    description: 'Date of Birth (YYYY-MM-DD)',
    example: '1998-05-15',
  })
  @IsString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Array of PDF/Docs for the player',
  })
  @IsOptional()
  documents?: any[];

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Profile picture / Avatar image',
  })
  @IsOptional()
  profilePicture?: any;
}
