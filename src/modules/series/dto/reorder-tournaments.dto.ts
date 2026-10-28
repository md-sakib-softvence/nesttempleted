import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class ReorderTournamentsDto {
  @ApiProperty({
    type: [String],
    description:
      'Ordered array of Tournament IDs representing the desired sequence',
    example: [
      'tourn-ea-fc25-lagos-01',
      'tourn-abuja-inv-01',
      'tourn-ph-open-01',
      'tourn-grand-finale-01',
    ],
  })
  @IsArray()
  @IsNotEmpty()
  @IsString({ each: true })
  orderedTournamentIds: string[];
}
