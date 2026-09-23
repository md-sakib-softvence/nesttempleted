import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAnnouncementTemplateDto {
  @ApiProperty({
    description: 'Unique template identifier key',
    example: 'PLAYER_PAYMENT_REQUIRED',
  })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({
    description: 'Title of the template',
    example: 'Player Payment Required',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Description of when this template is sent',
    example: 'Sent to players selected from the registration pool, asking them to pay the entry fee.',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({
    description: 'Dynamic variables available for this template',
    example: ['{{playerName}}', '{{tournamentName}}', '{{entryFee}}', '{{paymentDeadline}}', '{{paymentLink}}'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables?: string[];

  @ApiProperty({
    description: 'Message body text containing dynamic variables',
    example: 'Congratulations {{playerName}}! You have been selected to compete in {{tournamentName}}. Please pay the entry fee of {{entryFee}} by {{paymentDeadline}} to confirm your spot. Pay here: {{paymentLink}}',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({
    description: 'Default message body to reset to',
  })
  @IsString()
  @IsOptional()
  defaultMessage?: string;
}
