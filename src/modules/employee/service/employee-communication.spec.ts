import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmployeeService } from './employee.service';

describe('Employee communication notification', () => {
  let prisma: any;
  let notifications: any;
  let service: EmployeeService;

  beforeEach(() => {
    prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          employeeId: 'employee-uuid-1',
          name: 'Tournament Manager',
          role: 'MANAGER',
        }),
      },
    };
    notifications = {
      create: jest.fn().mockResolvedValue({
        notificationId: 'notification-1',
        userId: 'employee-uuid-1',
        title: 'Message from Administration',
        description: 'Please check the updated fixture.',
      }),
    };
    service = new EmployeeService(prisma, {} as any, {} as any, notifications);
  });

  it('saves a private notification for the selected staff account', async () => {
    const result = await service.sendEmployeeMessage('EMP-00001', {
      message: '  Please check the updated fixture.  ',
    });

    expect(prisma.employee.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ employeeId: 'EMP-00001' }, { showEmployeeId: 'EMP-00001' }],
        isDeleted: false,
        state: 'ACTIVE',
      },
      select: { employeeId: true, name: true, role: true },
    });
    expect(notifications.create).toHaveBeenCalledWith({
      status: 'INFORMATION',
      title: 'Message from Administration',
      description: 'Please check the updated fixture.',
      userId: 'employee-uuid-1',
    });
    expect(result.recipient).toEqual({
      employeeId: 'employee-uuid-1',
      name: 'Tournament Manager',
      role: 'MANAGER',
    });
  });

  it('does not create a notification when the staff member is not active', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);

    await expect(
      service.sendEmployeeMessage('employee-uuid-1', { message: 'Hello' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('rejects an empty message without creating a notification', async () => {
    await expect(
      service.sendEmployeeMessage('employee-uuid-1', { message: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(notifications.create).not.toHaveBeenCalled();
  });
});
