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
  @ApiProperty({ description: 'Employee Custom ID' })
  @IsString()
  @IsNotEmpty()
  showEmployeeId: string;

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

  @ApiPropertyOptional({ enum: EmployeeState, description: 'Employee State' })
  @IsEnum(EmployeeState)
  @IsOptional()
  state?: EmployeeState;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Profile Image File',
  })
  @IsOptional()
  profileImage?: any;

  @ApiPropertyOptional({
    type: [String],
    description: 'Documents',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  document?: string[];

  @ApiPropertyOptional({ description: 'Is Cash Leader' })
  @IsBoolean()
  @IsOptional()
  cashLeader?: boolean;

  @ApiPropertyOptional({ description: 'Enable Post' })
  @IsBoolean()
  @IsOptional()
  enablePost?: boolean;
}
