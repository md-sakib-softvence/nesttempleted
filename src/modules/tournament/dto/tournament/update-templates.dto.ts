import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class UpdateTournamentTemplatesDto {
  @ApiPropertyOptional({
    description: 'Player Card custom styling/layout template object',
    example: { border: 'gold', badge: 'pro', showStats: true },
  })
  @IsOptional()
  playerCardTemplate?: any;

  @ApiPropertyOptional({
    description: 'Fan Pass custom styling/layout template object',
    example: { backgroundUrl: 'https://example.com/pass.png', vipAccess: true },
  })
  @IsOptional()
  fanPassTemplate?: any;
}
