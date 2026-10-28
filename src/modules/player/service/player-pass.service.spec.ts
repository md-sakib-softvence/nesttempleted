import { Test, TestingModule } from '@nestjs/testing';
import { PlayerPassService } from './player-pass.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { TournamentRegistrationStatus } from '@prisma/client';

describe('PlayerPassService', () => {
  let service: PlayerPassService;
  let prisma: any;

  const mockRegistration = {
    registrationId: 'reg-1',
    tournamentId: 'tourney-1',
    playerId: 'player-123',
    status: TournamentRegistrationStatus.CONFIRMED,
    assignedSlot: 1,
    jerseySize: 'L',
    playerPhotoUrl: 'https://bucket.s3.amazonaws.com/photo.jpg',
    qrCodeString: 'PLAYER:tourney-1:player-123:reg-1',
    primaryTeamId: 'team-a',
    secondaryTeamId: 'team-b',
    homeVenueId: 'venue-1',
    createdAt: new Date(),
    tournament: {
      tournamentId: 'tourney-1',
      name: 'WINTER CHAMPIONSHIP 2024',
      gameTitle: 'EAFC 25',
      tournamentFormat: 'LEAGUE',
      canvasImage: 'canvas.jpg',
      tournamentLogoUrl: 'logo.jpg',
      playerOrgUrl: 'org.jpg',
      prOrgUrl: 'pr.jpg',
      currency: 'NGN',
      isDeleted: false,
      sponsors: [
        {
          sponsorId: 'sp-1',
          name: 'Nike',
          logo: 'nike.jpg',
          website: 'https://nike.com',
        },
      ],
    },
    player: {
      playerId: 'player-123',
      firstName: 'Alex',
      lastName: 'Mercer',
      gamerTag: 'PRO_ALEX',
      profilePicture: 'avatar.jpg',
    },
  };

  beforeEach(async () => {
    prisma = {
      tournamentRegistration: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerPassService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PlayerPassService>(PlayerPassService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMyPasses (Tab 1: 🎟️ SECURE PASS & ID)', () => {
    it('should return mapped competitor passes with formatted tournament details, status, and QR tokens', async () => {
      prisma.tournamentRegistration.findMany.mockResolvedValue([
        mockRegistration,
      ]);

      const result = await service.getMyPasses('player-123');

      expect(result).toBeDefined();
      expect(result.totalPasses).toBe(1);
      expect(result.confirmedCount).toBe(1);
      expect(result.passes).toHaveLength(1);

      const pass = result.passes[0];
      expect(pass.name).toBe('WINTER CHAMPIONSHIP 2024');
      expect(pass.gameTitle).toBe('EAFC 25');
      expect(pass.format).toBe('League');
      expect(pass.status).toBe(TournamentRegistrationStatus.CONFIRMED);
      expect(pass.qrCodeString).toBe('PLAYER:tourney-1:player-123:reg-1');
      expect(pass.sponsors).toHaveLength(1);
      expect(pass.player.gamertag).toBe('PRO_ALEX');
      expect(pass.player.fullName).toBe('Alex Mercer');
    });

    it('should auto-generate QR token if missing in database', async () => {
      prisma.tournamentRegistration.findMany.mockResolvedValue([
        {
          ...mockRegistration,
          qrCodeString: null,
        },
      ]);
      prisma.tournamentRegistration.update.mockResolvedValue({});

      const result = await service.getMyPasses('player-123');

      expect(result.passes[0].qrCodeString).toBe(
        'PLAYER:tourney-1:player-123:reg-1',
      );
    });
  });

  describe('getPassByTournament (Modal: COMPETITOR SECURE CARD)', () => {
    it('should return full Competitor Secure Card license details', async () => {
      prisma.tournamentRegistration.findFirst.mockResolvedValue(
        mockRegistration,
      );

      const result = await service.getPassByTournament(
        'player-123',
        'tourney-1',
      );

      expect(result).toBeDefined();
      expect(result.tournamentId).toBe('tourney-1');
      expect(result.registration.primaryTeamId).toBe('team-a');
      expect(result.registration.secondaryTeamId).toBe('team-b');
      expect(result.tournament.name).toBe('WINTER CHAMPIONSHIP 2024');
    });

    it('should throw NotFoundException if player is not registered in tournament', async () => {
      prisma.tournamentRegistration.findFirst.mockResolvedValue(null);

      await expect(
        service.getPassByTournament('player-123', 'non-existent-tourney'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
