import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  Min,
} from 'class-validator';
export class QualificationDrawDto {
  @ApiProperty() @IsString() tieGroupId: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  participantIds: string[];
  @ApiProperty() @IsInt() @Min(1) expectedVersion: number;
}
