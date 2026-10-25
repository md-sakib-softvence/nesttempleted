import { Test, TestingModule } from '@nestjs/testing';
import { PlayerWalletService } from './player-wallet.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { WalletStatus } from '@prisma/client';

describe('PlayerWalletService', () => {
  let service: PlayerWalletService;
  let prisma: any;

  const mockWallet = {
    walletId: 'wallet-1',
    playerId: 'player-123',
    userId: 'player-123',
    userRole: 'PLAYER',
    cashBalance: 25000.0,
    creditBalance: 2000.0,
    escrowBalance: 0.0,
    currency: 'NGN',
    status: WalletStatus.ACTIVE,
    payouts: [],
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
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
      activityLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerWalletService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PlayerWalletService>(PlayerWalletService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getWalletBalance', () => {
    it('should return withdrawable cash, credit balance, and pending payouts count', async () => {
      prisma.wallet.findUnique.mockResolvedValue(mockWallet);

      const result = await service.getWalletBalance('player-123');

      expect(result).toBeDefined();
      expect(result.cashBalance).toBe(25000.0);
      expect(result.creditBalance).toBe(2000.0);
      expect(result.totalBalance).toBe(27000.0);
      expect(result.isFrozen).toBe(false);
    });

    it('should auto-create zero-balance wallet if none exists yet', async () => {
      prisma.wallet.findUnique.mockResolvedValue(null);
      prisma.wallet.create.mockResolvedValue({
        ...mockWallet,
        cashBalance: 0.0,
        creditBalance: 0.0,
      });

      const result = await service.getWalletBalance('player-new');

      expect(prisma.wallet.create).toHaveBeenCalled();
      expect(result.cashBalance).toBe(0.0);
    });
  });

  describe('requestPayout - Double Spend & Security Protections', () => {
    it('should throw BadRequestException if NUBAN is not 10 digits', async () => {
      await expect(
        service.requestPayout('player-123', {
          bankAccount: '12345',
          amount: 5000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if requested amount is under 1,000 NGN', async () => {
      await expect(
        service.requestPayout('player-123', {
          bankAccount: '0123456789',
          amount: 500,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if cash balance is insufficient', async () => {
      prisma.wallet.findUnique.mockResolvedValue({
        ...mockWallet,
        cashBalance: 3000.0,
      });

      await expect(
        service.requestPayout('player-123', {
          bankAccount: '0123456789',
          amount: 5000.0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if wallet is frozen', async () => {
      prisma.wallet.findUnique.mockResolvedValue({
        ...mockWallet,
        status: WalletStatus.FROZEN,
      });

      await expect(
        service.requestPayout('player-123', {
          bankAccount: '0123456789',
          amount: 5000.0,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should atomically deduct cash balance, allocate to escrow, and record ledger transaction', async () => {
      prisma.wallet.findUnique.mockResolvedValue({
        ...mockWallet,
        cashBalance: 20000.0,
        escrowBalance: 0.0,
      });

      prisma.payoutRequest.create.mockResolvedValue({
        payoutId: 'payout-101',
        reference: 'PAYOUT-TEST-101',
        amount: 5000.0,
        status: 'PENDING',
        createdAt: new Date(),
      });

      prisma.walletTransaction.create.mockResolvedValue({
        transactionId: 'tx-101',
      });

      const response = await service.requestPayout('player-123', {
        bankAccount: '0123456789',
        amount: 5000.0,
        bankName: 'GTBank',
      });

      expect(response.success).toBe(true);
      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { walletId: 'wallet-1' },
        data: {
          cashBalance: 15000.0,
          escrowBalance: 5000.0,
        },
      });
      expect(prisma.payoutRequest.create).toHaveBeenCalled();
      expect(prisma.walletTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: -5000.0,
            balanceAfter: 15000.0,
          }),
        }),
      );
    });
  });
});
