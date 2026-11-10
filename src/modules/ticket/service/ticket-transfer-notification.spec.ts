import { TicketService } from './ticket.service';

describe('TicketService transfer notifications', () => {
  it('notifies the fan sender and recipient after a successful transfer', async () => {
    const initialTicket = {
      ticketId: 'ticket-1',
      showTicketId: 'SHOW-1',
      tournamentId: 'tournament-1',
      type: 'DAY_PASS',
      pricePaid: 10,
      currency: 'NGN',
      seatNumber: null,
      status: 'ACTIVE',
      checkedIn: false,
      purchasedBy: 'fan-sender',
      fanId: 'fan-sender',
      playerId: null,
      metadata: {},
      createdAt: new Date('2026-11-10T08:00:00Z'),
      tournament: { name: 'Cup Final' },
      fan: { firstName: 'Sending', surname: 'Fan' },
      player: null,
    };
    const recipient = {
      fanId: 'fan-recipient',
      phoneNumber: '+2348012345678',
      firstName: 'Receiving',
      surname: 'Fan',
      email: 'recipient@example.test',
    };
    const createdTicket = {
      ticketId: 'ticket-2',
      showTicketId: 'SHOW-2',
      tournament: { tournamentId: 'tournament-1', name: 'Cup Final' },
    };
    const tx = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', checkedIn: false }),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue(createdTicket),
      },
    };
    const prisma = {
      ticket: { findUnique: jest.fn().mockResolvedValue(initialTicket) },
      fan: { findMany: jest.fn().mockResolvedValue([recipient]) },
      player: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const notificationService = { create: jest.fn().mockResolvedValue({}) };
    const service = new TicketService(
      prisma as any,
      {} as any,
      {} as any,
      notificationService as any,
    );

    await expect(
      service.transferTicket(
        { userId: 'fan-sender', role: 'FAN' },
        { ticketId: 'ticket-1', recipientPhone: '+2348012345678' },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        originalTicketStatus: 'TRANSFERRED',
        recipientTicketId: 'ticket-2',
      }),
    );

    expect(notificationService.create).toHaveBeenCalledTimes(2);
    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'fan-sender', title: 'Ticket transferred' }),
    );
    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'fan-recipient', title: 'Ticket received' }),
    );
  });
});
