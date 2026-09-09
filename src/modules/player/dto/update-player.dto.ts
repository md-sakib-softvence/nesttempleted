import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { CreatePlayerDto } from './create-player.dto';

export class UpdatePlayerDto extends PartialType(CreatePlayerDto) {
  @ApiPropertyOptional({
    type: [String],
    description: 'Array of existing document URLs to delete',
  })
  @IsOptional()
  deletedDocuments?: string[];
}
