import { BadRequestException } from '@nestjs/common';
import { FanPlayerRegistrationService } from './fan-player-registration.service';

describe('FanPlayerRegistrationService football club selection', () => {
  let service: FanPlayerRegistrationService;
  let prisma: any;

  const selection = {
    primaryTeamId: 'Aldosivi',
    primaryTeamCountry: 'Argentina',
    primaryTeamCompetition: 'Liga Profesional',
    secondaryTeamId: 'Celtic',
    secondaryTeamCountry: 'Scotland',
    secondaryTeamCompetition: 'Premiership',
  };

  beforeEach(() => {
    prisma = {
      fan: { findUnique: jest.fn().mockResolvedValue({ fanId: 'fan-1', email: 'fan@example.com', isDeleted: false, status: 'ACTIVE' }) },
      player: { findFirst: jest.fn().mockResolvedValue(null) },
      tournament: {
        findUnique: jest.fn().mockResolvedValue({
          tournamentId: 'tournament-1',
          isDeleted: false,
          registrationOpen: true,
          status: 'REGISTRATION_OPEN',
          gameType: 'FOOTBALL',
          requireJerseySize: false,
          entryFee: 100,
          currency: 'NGN',
          name: 'Club selection test',
        }),
      },
      fanTournamentApplication: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }) => Promise.resolve({ id: 'application-1', ...data })),
      },
      payment: { findFirst: jest.fn().mockResolvedValue({ id: 'paid-1', status: 'SUCCESS' }) },
    };
    service = new FanPlayerRegistrationService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('accepts primary and backup clubs from different countries and competitions and saves both selections', async () => {
    const result = await service.createTournamentApplication('fan-1', 'tournament-1', selection);

    expect(prisma.fanTournamentApplication.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        primaryTeamId: 'Aldosivi',
        primaryTeamCountry: 'Argentina',
        primaryTeamCompetition: 'Liga Profesional',
        secondaryTeamId: 'Celtic',
        secondaryTeamCountry: 'Scotland',
        secondaryTeamCompetition: 'Premiership',
      }),
    });
    expect(result.requiresPayment).toBe(false);
  });

  it('rejects a club that does not belong to its selected country and competition', async () => {
    await expect(
      service.createTournamentApplication('fan-1', 'tournament-1', {
        ...selection,
        secondaryTeamCountry: 'Argentina',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.fanTournamentApplication.create).not.toHaveBeenCalled();
  });

  it('rejects selecting the same club as primary and backup', async () => {
    await expect(
      service.createTournamentApplication('fan-1', 'tournament-1', {
        ...selection,
        secondaryTeamId: 'Aldosivi',
        secondaryTeamCountry: 'Argentina',
        secondaryTeamCompetition: 'Liga Profesional',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.fanTournamentApplication.create).not.toHaveBeenCalled();
  });
});
