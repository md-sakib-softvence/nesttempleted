import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { NotificationGateway } from './notification.gateway';

@Injectable()
export class NotificationService {
  constructor(
    private prisma: PrismaService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async create(createNotificationDto: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: createNotificationDto,
    });
    this.notificationGateway.publishCreated(notification.userId);
    return notification;
  }

  findAll() {
    return this.prisma.notification.findMany();
  }

  findForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
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

  async markAsReadForUser(notificationId: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { notificationId, userId },
      data: { isRead: true },
    });

    if (result.count === 0) {
      throw new NotFoundException(
        `Notification with ID ${notificationId} was not found`,
      );
    }

    return this.findOne(notificationId);
  }

  markAllAsReadForUser(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  remove(notificationId: string) {
    return this.prisma.notification.delete({
      where: { notificationId },
    });
  }
}
