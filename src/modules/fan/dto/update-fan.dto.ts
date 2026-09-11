import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateFanDto } from './create-fan.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateFanDto extends PartialType(CreateFanDto) {
  @ApiPropertyOptional({ description: 'Username' })
  @IsString()
  @IsOptional()
  username?: string;

  @ApiPropertyOptional({ description: 'Gamer Tag' })
  @IsString()
  @IsOptional()
  gamerTag?: string;

  @ApiPropertyOptional({ description: 'Surname' })
  @IsString()
  @IsOptional()
  surname?: string;
}
