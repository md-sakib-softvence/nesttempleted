import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { EmployeeState } from '@prisma/client';
import { Transform } from 'class-transformer';
import { CreateEmployeeDto } from './create-employee.dto';

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {
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

  @ApiPropertyOptional({ description: 'Is Cash Leader' })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  cashLeader?: boolean;

  @ApiPropertyOptional({ description: 'Enable Post' })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  enablePost?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: 'Array of existing document URLs to delete',
  })
  @IsOptional()
  deletedDocuments?: string[];

  @ApiPropertyOptional({ enum: EmployeeState, description: 'Employee State (Status)' })
  @IsEnum(EmployeeState)
  @IsOptional()
  state?: EmployeeState;
}
