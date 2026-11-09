import { NotificationGateway } from './notification.gateway';

describe('NotificationGateway staff rooms', () => {
  it.each(['EMPLOYEE', 'MANAGER', 'AMBASSADOR'])(
    'authenticates an active %s and joins its private notification room',
    async (role) => {
      const jwt = { verifyAsync: jest.fn().mockResolvedValue({ userId: 'employee-uuid-1', role }) };
      const config = { get: jest.fn().mockReturnValue('test-secret') };
      const prisma = {
        employee: {
          findFirst: jest.fn().mockResolvedValue({ employeeId: 'employee-uuid-1' }),
        },
      };
      const gateway = new NotificationGateway(jwt as any, config as any, prisma as any);
      const client = {
        handshake: { auth: { token: 'staff-token' } },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
      } as any;

      await gateway.handleConnection(client);

      expect(prisma.employee.findFirst).toHaveBeenCalledWith({
        where: {
          employeeId: 'employee-uuid-1',
          state: 'ACTIVE',
          isDeleted: false,
          role,
        },
        select: { employeeId: true },
      });
      expect(client.join).toHaveBeenCalledWith('user:employee-uuid-1');
      expect(client.emit).toHaveBeenCalledWith('notifications:ready');
      expect(client.disconnect).not.toHaveBeenCalled();
    },
  );

  it('rejects a staff token when no active staff account exists', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ userId: 'employee-uuid-1', role: 'MANAGER' }) };
    const config = { get: jest.fn().mockReturnValue('test-secret') };
    const prisma = { employee: { findFirst: jest.fn().mockResolvedValue(null) } };
    const gateway = new NotificationGateway(jwt as any, config as any, prisma as any);
    const client = {
      handshake: { auth: { token: 'staff-token' } },
      join: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    await gateway.handleConnection(client);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      'notifications:unauthorized',
      expect.objectContaining({ message: expect.stringContaining('active player, fan, or staff account') }),
    );
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });
});
