import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, IsIn } from 'class-validator';

export class ForgetPasswordDto {
  @ApiProperty({ description: 'Email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'User Role',
    enum: [
      'admin',
      'super_admin',
      'player',
      'fan',
      'security_guard',
      'employee',
      'manager',
      'ambassador',
    ],
  })
  @IsNotEmpty()
  @IsString()
  @IsIn([
    'admin',
    'super_admin',
    'player',
    'fan',
    'security_guard',
    'employee',
    'manager',
    'ambassador',
  ])
  role: string;
}
