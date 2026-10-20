import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class LinkTournamentsDto {
  @ApiProperty({
    type: [String],
    description: 'Array of Tournament IDs to link with the series',
    example: ['tourn-ea-fc25-lagos-01', 'tourn-abuja-inv-01'],
  })
  @IsArray()
  @IsNotEmpty()
  @IsString({ each: true })
  tournamentIds: string[];
}
