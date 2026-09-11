import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreatePlayerDto } from './create-player.dto';

export class UpdatePlayerDto extends PartialType(CreatePlayerDto) {
  @ApiPropertyOptional({
    type: [String],
    description: 'Array of existing document URLs to delete',
  })
  @IsOptional()
  deletedDocuments?: string[];

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
