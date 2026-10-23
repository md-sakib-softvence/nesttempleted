import { Test, TestingModule } from '@nestjs/testing';
import { PlayerService } from './player.service';
import { PlayerDocumentService } from './player-document.service';
import { PlayerPassService } from './player-pass.service';
import { PlayerWalletService } from './player-wallet.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../../mail/mail.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';

describe('PlayerService', () => {
  let service: PlayerService;
  let prisma: any;

  const mockPlayer = {
    playerId: 'player-123',
    showPlayerId: 'P-1001',
    firstName: 'Alex',
    lastName: 'Mercer',
    email: 'alex@example.com',
    password: '$2b$10$hashedpassword',
    phoneNumber: '+1234567890',
    username: 'alexm',
    gamerTag: 'PRO_ALEX',
    profilePicture: 'avatar-key.png',
    dateOfBirth: new Date('1998-05-15'),
    document: ['legacy-doc.pdf'],
    isDeleted: false,
    documents: [
      {
        id: 'doc-1',
        playerId: 'player-123',
        type: 'Government ID',
        url: 'gov-id.pdf',
        uploadDate: new Date('2026-01-01'),
        status: DocumentStatus.VERIFIED,
        notes: null,
      },
    ],
    registrationHistory: [],
    marketingData: null,
  };

  beforeEach(async () => {
    prisma = {
      player: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      playerDocument: {
        findFirst: jest.fn(),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
      },
      wallet: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      walletTransaction: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      payoutRequest: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      activity: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerService,
        PlayerDocumentService,
        PlayerPassService,
        PlayerWalletService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { signAsync: jest.fn(), verifyAsync: jest.fn() } },
        { provide: MailService, useValue: { sendRecoveryLink: jest.fn() } },
      ],
    }).compile();

    service = module.get<PlayerService>(PlayerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPlayerById', () => {
    it('should return formatted player with frontend contract fields and isVerified flag', async () => {
      prisma.player.findUnique.mockResolvedValue(mockPlayer);

      const result = await service.getPlayerById('player-123');

      expect(result).toBeDefined();
      expect(result.id).toBe('player-123');
      expect(result.fullName).toBe('Alex Mercer');
      expect(result.gamertag).toBe('PRO_ALEX');
      expect(result.phone).toBe('+1234567890');
      expect(result.dateOfBirth).toBe('1998-05-15');
      expect(result.isVerified).toBe(true);
      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].status).toBe('Verified');
      expect(result.password).toBeUndefined(); // Never leak password hash
    });

    it('should throw NotFoundException if player does not exist', async () => {
      prisma.player.findUnique.mockResolvedValue(null);

      await expect(service.getPlayerById('unknown-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updatePlayer - Authorization & Security', () => {
    it('should throw ForbiddenException if a player attempts to edit another player', async () => {
      prisma.player.findUnique.mockResolvedValue(mockPlayer);

      await expect(
        service.updatePlayer(
          'player-123',
          { gamerTag: 'HACKED' },
          undefined,
          undefined,
          { userId: 'attacker-player-999', role: 'player' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow a player to update their own profile', async () => {
      prisma.player.findUnique.mockResolvedValue(mockPlayer);
      prisma.player.findFirst.mockResolvedValue(null);
      prisma.player.update.mockResolvedValue({
        ...mockPlayer,
        gamerTag: 'NEW_TAG',
      });

      const result = await service.updatePlayer(
        'player-123',
        { gamerTag: 'NEW_TAG' },
        undefined,
        undefined,
        { userId: 'player-123', role: 'player' },
      );

      expect(result).toBeDefined();
      expect(result.gamertag).toBe('NEW_TAG');
    });

    it('should allow an admin to update any player', async () => {
      prisma.player.findUnique.mockResolvedValue(mockPlayer);
      prisma.player.findFirst.mockResolvedValue(null);
      prisma.player.update.mockResolvedValue({
        ...mockPlayer,
        gamerTag: 'ADMIN_SET_TAG',
      });

      const result = await service.updatePlayer(
        'player-123',
        { gamerTag: 'ADMIN_SET_TAG' },
        undefined,
        undefined,
        { userId: 'admin-1', role: 'ADMIN' },
      );

      expect(result).toBeDefined();
      expect(result.gamertag).toBe('ADMIN_SET_TAG');
    });
  });

  describe('updateDocumentStatus - Admin Verification', () => {
    it('should update document status to VERIFIED', async () => {
      prisma.playerDocument.findFirst.mockResolvedValue({
        id: 'doc-1',
        playerId: 'player-123',
        status: DocumentStatus.PENDING,
      });

      prisma.playerDocument.update.mockResolvedValue({
        id: 'doc-1',
        playerId: 'player-123',
        status: DocumentStatus.VERIFIED,
        notes: 'Approved by Admin',
      });

      const result = await service.updateDocumentStatus(
        'player-123',
        'doc-1',
        { status: DocumentStatus.VERIFIED, notes: 'Approved by Admin' },
      );

      expect(result.status).toBe(DocumentStatus.VERIFIED);
      expect(result.notes).toBe('Approved by Admin');
    });
  });
});
