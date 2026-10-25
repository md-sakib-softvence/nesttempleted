import { PartialType, OmitType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { CreatePlayerDto } from './create-player.dto';

/**
 * DTO for Player Profile & Settings updates.
 * Security Note: Password changes are strictly excluded from this DTO
 * and must be performed via the dedicated /auth/change-password endpoint.
 */
export class UpdatePlayerDto extends PartialType(
  OmitType(CreatePlayerDto, ['password'] as const),
) {
  @ApiPropertyOptional({
    description: 'Full Name (convenience field to set firstName & lastName)',
    example: 'Alex Mercer',
  })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Array of existing document IDs or URLs/keys to delete',
  })
  @IsOptional()
  deletedDocuments?: string[];

  @ApiPropertyOptional({
    description: 'Flag to remove current profile picture',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  deleteProfilePicture?: boolean;

  @ApiPropertyOptional({
    description: 'Document type name (default: "Government ID")',
    example: 'Government ID',
  })
  @IsString()
  @IsOptional()
  documentType?: string;

  @ApiPropertyOptional({ description: 'Username', example: 'alex_mercer' })
  @IsString()
  @IsOptional()
  username?: string;

  @ApiPropertyOptional({ description: 'Surname', example: 'Mercer' })
  @IsString()
  @IsOptional()
  surname?: string;

  @ApiPropertyOptional({ description: 'Phone alias', example: '+1234567890' })
  @IsString()
  @IsOptional()
  phone?: string;
}
