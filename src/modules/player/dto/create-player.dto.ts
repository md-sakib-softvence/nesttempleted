import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePlayerDto {
  @ApiProperty({ description: 'Show Player ID' })
  @IsString()
  @IsNotEmpty()
  showPlayerId: string;

  @ApiProperty({ description: 'First Name' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ description: 'Last Name' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

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

  @ApiPropertyOptional({ description: 'Global Record' })
  @IsOptional()
  @IsString()
  globalRecord?: string;

  @ApiPropertyOptional({ description: 'Profession' })
  @IsOptional()
  @IsString()
  profession?: string;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Array of PDF/Docs for the player',
  })
  @IsOptional()
  documents?: any[];
}
