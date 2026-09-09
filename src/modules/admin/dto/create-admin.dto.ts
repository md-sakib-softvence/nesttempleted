import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAdminDto {
  @ApiProperty({ description: 'Admin Email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Admin Name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Admin Password' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Profile Image File',
  })
  @IsOptional()
  profileImage?: any;
}
