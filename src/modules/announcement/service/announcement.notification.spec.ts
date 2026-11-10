import { AnnouncementService } from './announcement.service';

describe('AnnouncementService fan notifications', () => {
  it('creates inbox records for active fans when a global app announcement is sent', async () => {
    const fans = [{ fanId: 'fan-1' }, { fanId: 'fan-2' }];
    const announcement = {
      announcementId: 'announcement-1',
      audience: 'GLOBAL',
      channels: ['APP'],
      status: 'SENT',
    };
    const tx = {
      announcement: { create: jest.fn().mockResolvedValue(announcement) },
      fan: { findMany: jest.fn().mockResolvedValue(fans) },
      notification: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const notificationGateway = { publishCreated: jest.fn() };
    const service = new AnnouncementService(prisma as any, notificationGateway as any);

    await expect(
      service.create({
        title: 'Tournament update',
        content: 'Registration is open.',
        audience: 'GLOBAL',
        channels: ['APP'],
        status: 'SENT' as any,
      }),
    ).resolves.toBe(announcement);

    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: fans.map((fan) =>
        expect.objectContaining({
          userId: fan.fanId,
          title: 'Tournament update',
          status: 'INFORMATION',
        }),
      ),
    });
    expect(notificationGateway.publishCreated).toHaveBeenCalledTimes(2);
    expect(notificationGateway.publishCreated).toHaveBeenCalledWith('fan-1');
    expect(notificationGateway.publishCreated).toHaveBeenCalledWith('fan-2');
  });
});
