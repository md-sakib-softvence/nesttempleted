import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class LinkTournamentsDto {
  @ApiProperty({
    type: [String],
    description: 'Array of Tournament IDs to link with the series',
    example: ['tourn-ea-fc25-lagos-01', 'tourn-abuja-inv-01'],
  })
  @Transform(({ value, obj }) => {
    const raw = value !== undefined ? value : obj?.tournaments;
    if (!raw) return [];
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) =>
              typeof item === 'object' && item
                ? item.id || item.tournamentId
                : item,
            )
            .filter(Boolean);
        }
      } catch {
        /* ignore invalid JSON string */
      }
      return raw
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
    if (Array.isArray(raw)) {
      return raw
        .map((item) =>
          typeof item === 'object' && item
            ? item.id || item.tournamentId
            : item,
        )
        .filter(Boolean);
    }
    return [];
  })
  @IsArray()
  @IsNotEmpty()
  @IsString({ each: true })
  tournamentIds: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  tournaments?: any;
}
