import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSystemConfigDto {
  @IsOptional()
  @IsBoolean()
  fanPredictions?: boolean;

  @IsOptional()
  @IsBoolean()
  staffPosSystem?: boolean;

  @IsOptional()
  @IsBoolean()
  newBracketViewBeta?: boolean;

  @IsOptional()
  @IsBoolean()
  automatedPayouts?: boolean;
}
