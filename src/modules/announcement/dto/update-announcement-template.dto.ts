import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateAnnouncementTemplateDto } from './create-announcement-template.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateAnnouncementTemplateDto extends PartialType(
  CreateAnnouncementTemplateDto,
) {
  @ApiPropertyOptional({
    description: 'Updated message body text',
    example: 'Congratulations {{playerName}}! You have been selected for {{tournamentName}}. Please pay the entry fee of {{entryFee}}.',
  })
  @IsString()
  @IsOptional()
  message?: string;
}
