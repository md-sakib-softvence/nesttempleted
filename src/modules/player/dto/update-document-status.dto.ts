import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DocumentStatus } from '@prisma/client';

export class UpdateDocumentStatusDto {
  @ApiProperty({
    enum: DocumentStatus,
    description: 'Updated compliance status for the document (PENDING, VERIFIED, REJECTED)',
    example: DocumentStatus.VERIFIED,
  })
  @IsEnum(DocumentStatus)
  @IsNotEmpty()
  status: DocumentStatus;

  @ApiPropertyOptional({
    description: 'Internal or auditor notes explaining the review decision',
    example: 'Government ID matches player legal name and date of birth.',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
