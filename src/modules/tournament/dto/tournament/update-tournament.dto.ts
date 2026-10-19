import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateTournamentDto } from './create-tournament.dto';
import { IsInt, IsOptional, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateTournamentDto extends PartialType(CreateTournamentDto) {
  @ApiPropertyOptional({
    description: 'Expected version for optimistic locking',
    example: 1,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined && value !== '' ? Number(value) : undefined,
  )
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
