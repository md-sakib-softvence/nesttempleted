import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsIn } from 'class-validator';

export class ForgetPasswordDto {
  @ApiProperty({ description: 'Email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'User Role',
    enum: ['fan', 'player'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['fan', 'player'])
  role?: 'fan' | 'player';
}
