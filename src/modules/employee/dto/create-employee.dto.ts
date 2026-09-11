import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
  IsBoolean,
  IsArray,
} from 'class-validator';
import { EmployeeRole, EmployeeState } from '@prisma/client';

export class CreateEmployeeDto {
  @ApiProperty({ description: 'Employee Name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Employee Email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Employee Phone Number' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ description: 'Employee Password' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({ enum: EmployeeRole, description: 'Employee Role' })
  @IsEnum(EmployeeRole)
  @IsOptional()
  role?: EmployeeRole;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Profile Image File',
  })
  @IsOptional()
  profileImage?: any;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Documents',
  })
  @IsOptional()
  document?: any[];
}
