import { NotificationService } from './notification.service';

describe('NotificationService delivery', () => {
  it('persists the notification and publishes to that user room', async () => {
    const notification = {
      notificationId: 'notification-1',
      userId: 'employee-uuid-1',
      title: 'Message from Administration',
      description: 'Please check the updated fixture.',
    };
    const prisma = {
      notification: { create: jest.fn().mockResolvedValue(notification) },
    };
    const gateway = { publishCreated: jest.fn() };
    const service = new NotificationService(prisma as any, gateway as any);

    const result = await service.create({
      status: 'INFORMATION' as any,
      title: notification.title,
      description: notification.description,
      userId: notification.userId,
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        status: 'INFORMATION',
        title: notification.title,
        description: notification.description,
        userId: notification.userId,
      },
    });
    expect(gateway.publishCreated).toHaveBeenCalledWith('employee-uuid-1');
    expect(result).toBe(notification);
  });
});
