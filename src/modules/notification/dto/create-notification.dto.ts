import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsBoolean,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { NotificationStatus } from '@prisma/client';

export class CreateNotificationDto {
  @IsEnum(NotificationStatus)
  @IsNotEmpty()
  status: NotificationStatus;

  @IsBoolean()
  @IsOptional()
  isRead?: boolean;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsUUID()
  @IsNotEmpty()
  userId: string;
}
