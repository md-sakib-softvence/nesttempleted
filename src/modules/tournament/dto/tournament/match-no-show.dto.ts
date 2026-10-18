import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class MatchNoShowDto {
  @ApiProperty({
    description: 'Player ID of the player who did not show up',
    example: 'player-uuid-1',
  })
  @IsString()
  @IsNotEmpty()
  offendingPlayerId: string;
}
