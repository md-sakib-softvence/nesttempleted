import { RaffleService } from './raffle.service';

describe('RaffleService notifications', () => {
  it('persists the draw and notifies each selected winner', async () => {
    const raffle = {
      raffleId: 'raffle-1',
      name: 'Final Giveaway',
      prizeDescription: 'Gaming headset',
      numberOfWinners: 1,
      status: 'OPEN',
      entries: [
        { userId: 'fan-1', userType: 'FAN', name: 'Fan One', ticketNumber: 'T-1' },
      ],
      winners: [],
    };
    const updated = { ...raffle, status: 'DRAWN', winners: [{ userId: 'fan-1' }] };
    const prisma = {
      raffle: {
        findFirst: jest.fn().mockResolvedValue(raffle),
        update: jest.fn().mockResolvedValue(updated),
      },
    };
    const notificationService = { create: jest.fn().mockResolvedValue({}) };
    const service = new RaffleService(prisma as any, notificationService as any);

    await expect(service.drawRaffle('raffle-1')).resolves.toBe(updated);
    expect(prisma.raffle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { raffleId: 'raffle-1' },
        data: expect.objectContaining({ status: 'DRAWN' }),
      }),
    );
    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'fan-1',
        status: 'ALERT',
        title: 'You won: Final Giveaway',
      }),
    );
  });
});
