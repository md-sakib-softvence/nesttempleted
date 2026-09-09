import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  create(createNotificationDto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: createNotificationDto,
    });
  }

  findAll() {
    return this.prisma.notification.findMany();
  }

  async findOne(notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { notificationId },
    });
    if (!notification) {
      throw new NotFoundException(
        `Notification with ID ${notificationId} not found`,
      );
    }
    return notification;
  }

  update(notificationId: string, updateNotificationDto: UpdateNotificationDto) {
    return this.prisma.notification.update({
      where: { notificationId },
      data: updateNotificationDto,
    });
  }

  remove(notificationId: string) {
    return this.prisma.notification.delete({
      where: { notificationId },
    });
  }
}
