import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RequestPayoutDto } from '../dto/request-payout.dto';
import {
  WalletStatus,
  WalletTransaction,
  WalletTransactionType,
  TransactionStatus,
  PayoutStatus,
} from '@prisma/client';
import * as crypto from 'crypto';
import { createActivities } from '../../utils/activity.util';

@Injectable()
export class PlayerWalletService {
  private readonly logger = new Logger(PlayerWalletService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent wallet resolver: Retrieves existing wallet or safely instantiates
   * a compliant zero-balance ledger account for the player.
   */
  async getOrCreateWallet(playerId: string, tx?: any) {
    const client = tx || this.prisma;

    let wallet = await client.wallet.findUnique({
      where: { playerId },
      include: {
        payouts: {
          where: { status: PayoutStatus.PENDING },
        },
      },
    });

    if (!wallet) {
      // Also check by userId fallback
      wallet = await client.wallet.findUnique({
        where: { userId: playerId },
        include: {
          payouts: {
            where: { status: PayoutStatus.PENDING },
          },
        },
      });
    }

    if (!wallet) {
      wallet = await client.wallet.create({
        data: {
          playerId,
          userId: playerId,
          userRole: 'PLAYER',
          cashBalance: 0.0,
          creditBalance: 0.0,
          escrowBalance: 0.0,
          currency: 'NGN',
          status: WalletStatus.ACTIVE,
        },
        include: {
          payouts: {
            where: { status: PayoutStatus.PENDING },
          },
        },
      });
      this.logger.log(
        `Initialized fresh Player Wallet for player ID #${playerId}`,
      );
    }

    return wallet;
  }

  /**
   * 1. Get Wallet Balance for Header Pill & Financial Dashboard
   * (Tab 2: 💰 Payout Ledger - Withdrawable & Non-Withdrawable balances).
   */
  async getWalletBalance(playerId: string) {
    if (!playerId) {
      throw new BadRequestException('Player ID is required');
    }

    const wallet = await this.getOrCreateWallet(playerId);

    const pendingPayoutsCount = wallet.payouts?.length || 0;
    const totalBalance = Number(
      (wallet.cashBalance + wallet.creditBalance).toFixed(2),
    );

    return {
      walletId: wallet.walletId,
      playerId,
      cashBalance: wallet.cashBalance,
      creditBalance: wallet.creditBalance,
      escrowBalance: wallet.escrowBalance,
      totalBalance,
      currency: wallet.currency || 'NGN',
      status: wallet.status,
      isFrozen: wallet.status === WalletStatus.FROZEN,
      pendingPayoutsCount,
      updatedAt: wallet.updatedAt,
    };
  }

  /**
   * 2. Get Ledger History Table
   * (Tab 2: 💰 Payout Ledger - Transaction Ledger History).
   */
  async getLedgerHistory(
    playerId: string,
    options: number | { page?: number | string; limit?: number | string } = 50,
  ) {
    if (!playerId) {
      throw new BadRequestException('Player ID is required');
    }

    const wallet = await this.getOrCreateWallet(playerId);

    const page =
      typeof options === 'object' && options?.page !== undefined
        ? Math.max(1, Number(options.page) || 1)
        : 1;
    const limit =
      typeof options === 'number'
        ? Math.min(100, Math.max(1, options))
        : Math.min(100, Math.max(1, Number(options?.limit) || 50));
    const skip = (page - 1) * limit;

    const [total, transactions] = await Promise.all([
      this.prisma.walletTransaction.count({
        where: { walletId: wallet.walletId },
      }),
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.walletId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const pagination = {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    return {
      walletId: wallet.walletId,
      currency: wallet.currency || 'NGN',
      totalCount: total,
      transactions: transactions.map((tx) => ({
        id: tx.transactionId,
        reference: tx.reference,
        type: tx.type,
        displayType: tx.type.replace(/_/g, ' '),
        amount: tx.amount,
        balanceAfter: tx.balanceAfter,
        currency: tx.currency,
        status: tx.status,
        description: tx.description || 'Ledger Settlement',
        date: tx.createdAt.toISOString().split('T')[0],
        timestamp: tx.createdAt,
      })),
      pagination,
      meta: pagination,
    };
  }

  /** Admin view of a selected player's financial totals and ledger entries. */
  async getPlayerFinancials(
    playerId: string,
    options: { page?: number | string; limit?: number | string } = {},
  ) {
    const player = await this.prisma.player.findFirst({
      where: { playerId, isDeleted: false },
      select: { playerId: true },
    });
    if (!player) throw new NotFoundException('Player not found');

    const wallet = await this.prisma.wallet.findFirst({
      where: { OR: [{ playerId }, { userId: playerId }] },
      select: { walletId: true, currency: true },
    });

    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const walletTransactionsQuery: Promise<WalletTransaction[]> = wallet
      ? this.prisma.walletTransaction.findMany({
          where: { walletId: wallet.walletId },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]);
    const [walletTransactions, registrations, tickets] = await Promise.all([
      walletTransactionsQuery,
      this.prisma.tournamentRegistration.findMany({
        where: { playerId },
        select: {
          registrationId: true,
          tournamentId: true,
          status: true,
          paymentStatus: true,
          createdAt: true,
          updatedAt: true,
          tournament: {
            select: { name: true, entryFee: true, currency: true },
          },
        },
      }),
      this.prisma.ticket.findMany({
        where: { playerId, purchaserRole: 'PLAYER' },
        select: {
          ticketId: true,
          tournamentId: true,
          pricePaid: true,
          currency: true,
          paymentStatus: true,
          createdAt: true,
          tournament: { select: { name: true } },
        },
      }),
    ]);

    const displayTypes: Record<string, string> = {
      ENTRY_FEE: 'entry_fee',
      TICKET_PURCHASE: 'ticket_sale',
      PRIZE_PAYOUT: 'payout',
      REFUND: 'refund',
      WITHDRAWAL_REQUEST: 'withdrawal',
      PAYOUT_APPROVED: 'withdrawal',
      PAYOUT_REJECTED: 'payout_rejected',
      CREDIT_ADJUSTMENT: 'credit_adjustment',
      SYSTEM_BONUS: 'system_bonus',
    };

    const transactions = walletTransactions
      .filter(
        // Registration and ticket purchases are reconstructed from their
        // canonical records below, avoiding duplicate wallet ledger entries.
        (transaction) =>
          transaction.type !== WalletTransactionType.ENTRY_FEE &&
          transaction.type !== WalletTransactionType.TICKET_PURCHASE,
      )
      .map((transaction) => ({
        id: transaction.transactionId,
        identityId: playerId,
        reference: transaction.reference,
        type: displayTypes[transaction.type] || transaction.type.toLowerCase(),
        amount: Math.abs(transaction.amount),
        currency: transaction.currency || wallet?.currency || 'NGN',
        status: transaction.status,
        description:
          transaction.description || transaction.type.replace(/_/g, ' '),
        timestamp: transaction.createdAt,
      }));

    for (const registration of registrations) {
      const paymentStatus = String(registration.paymentStatus).toUpperCase();
      const entryFee = Number(registration.tournament?.entryFee || 0);
      if (entryFee <= 0) continue;
      const tournamentName = registration.tournament?.name || 'Tournament';
      if (
        ['PAID', 'SUCCESS', 'CONFIRMED', 'REFUNDED'].includes(paymentStatus)
      ) {
        transactions.push({
          id: `registration:${registration.registrationId}:entry-fee`,
          identityId: playerId,
          reference: registration.registrationId,
          type: 'entry_fee',
          amount: entryFee,
          currency:
            registration.tournament?.currency || wallet?.currency || 'NGN',
          status: TransactionStatus.SUCCESS,
          description: `${tournamentName} entry fee`,
          timestamp: registration.createdAt,
        });
      }
      if (paymentStatus === 'REFUNDED') {
        transactions.push({
          id: `registration:${registration.registrationId}:refund`,
          identityId: playerId,
          reference: registration.registrationId,
          type: 'refund',
          amount: entryFee,
          currency:
            registration.tournament?.currency || wallet?.currency || 'NGN',
          status: TransactionStatus.SUCCESS,
          description: `${tournamentName} entry fee refund`,
          timestamp: registration.updatedAt,
        });
      }
    }

    for (const ticket of tickets) {
      const paymentStatus = String(ticket.paymentStatus).toUpperCase();
      const ticketAmount = Math.abs(ticket.pricePaid);
      if (['SUCCESS', 'PAID', 'REFUNDED'].includes(paymentStatus)) {
        transactions.push({
          id: `ticket:${ticket.ticketId}:purchase`,
          identityId: playerId,
          reference: ticket.ticketId,
          type: 'ticket_sale',
          amount: ticketAmount,
          currency: ticket.currency || wallet?.currency || 'NGN',
          status: TransactionStatus.SUCCESS,
          description: `${ticket.tournament?.name || 'Tournament'} ticket purchase`,
          timestamp: ticket.createdAt,
        });
      }
      if (paymentStatus === 'REFUNDED') {
        transactions.push({
          id: `ticket:${ticket.ticketId}:refund`,
          identityId: playerId,
          reference: ticket.ticketId,
          type: 'refund',
          amount: ticketAmount,
          currency: ticket.currency || wallet?.currency || 'NGN',
          status: TransactionStatus.SUCCESS,
          description: `${ticket.tournament?.name || 'Tournament'} ticket refund`,
          timestamp: ticket.createdAt,
        });
      }
    }

    transactions.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    const successfulTransactions = transactions.filter(
      (transaction) => transaction.status === TransactionStatus.SUCCESS,
    );
    const grossSpend = successfulTransactions
      .filter(
        (transaction) =>
          transaction.type === 'entry_fee' ||
          transaction.type === 'ticket_sale',
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const refunds = successfulTransactions
      .filter((transaction) => transaction.type === 'refund')
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const totalSpent = Math.max(0, grossSpend - refunds);
    const totalWinnings = successfulTransactions
      .filter((transaction) => transaction.type === 'payout')
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const total = transactions.length;
    const pagination = {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    return {
      playerId,
      currency: wallet?.currency || 'NGN',
      totalSpent: Number(totalSpent.toFixed(2)),
      totalWinnings: Number(totalWinnings.toFixed(2)),
      transactions: transactions.slice((page - 1) * limit, page * limit),
      pagination,
    };
  }

  /**
   * 3. Disburse Payout Request (Request Ledger Settlement)
   * High Security & Double-Spending Protection:
   * Wrapped in an atomic DB transaction with pessimistic balance verification.
   */
  async requestPayout(playerId: string, dto: RequestPayoutDto) {
    if (!playerId) {
      throw new BadRequestException('Player ID is required');
    }

    // 1. Validate NUBAN format (strict 10-digit check)
    const cleanAccount = dto.bankAccount.trim();
    if (!/^\d{10}$/.test(cleanAccount)) {
      throw new BadRequestException(
        'Invalid Bank Account Number. Must be a valid 10-digit NUBAN card/account number.',
      );
    }

    // 2. Validate Minimum Payout Limit
    const payoutAmount = Number(dto.amount);
    if (isNaN(payoutAmount) || payoutAmount < 1000) {
      throw new BadRequestException('Minimum payout amount limit is ₦1,000.');
    }

    // 3. Atomic execution block
    return await this.prisma.$transaction(async (tx) => {
      const wallet = await this.getOrCreateWallet(playerId, tx);

      // Verify account compliance status
      if (wallet.status === WalletStatus.FROZEN) {
        throw new ForbiddenException(
          'Withdrawal locked: Your wallet has been frozen by administration. Please contact support.',
        );
      }

      if (wallet.status === WalletStatus.SUSPENDED) {
        throw new ForbiddenException(
          'Withdrawal locked: Wallet account is currently suspended.',
        );
      }

      // Verify sufficient withdrawable ledger funds
      if (wallet.cashBalance < payoutAmount) {
        throw new BadRequestException(
          `Withdrawal failed: Insufficient withdrawable ledger balance. Current available: ₦${wallet.cashBalance.toLocaleString()}, Requested: ₦${payoutAmount.toLocaleString()}`,
        );
      }

      const newCashBalance = Number(
        (wallet.cashBalance - payoutAmount).toFixed(2),
      );
      const newEscrowBalance = Number(
        (wallet.escrowBalance + payoutAmount).toFixed(2),
      );

      // 4. Atomically decrement withdrawable cash balance and allocate to clearing escrow
      await tx.wallet.update({
        where: { walletId: wallet.walletId },
        data: {
          cashBalance: newCashBalance,
          escrowBalance: newEscrowBalance,
        },
      });

      const uniqueSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
      const payoutReference = `PAYOUT-${Date.now().toString(36).toUpperCase()}-${uniqueSuffix}`;
      const txReference = `WTX-${Date.now().toString(36).toUpperCase()}-${uniqueSuffix}`;

      // 5. Create durable PayoutRequest record
      const payoutRecord = await tx.payoutRequest.create({
        data: {
          walletId: wallet.walletId,
          playerId,
          reference: payoutReference,
          accountNumber: cleanAccount,
          bankCode: dto.bankCode || null,
          bankName: dto.bankName || 'NIBSS Bank Account',
          accountName: dto.accountName || null,
          amount: payoutAmount,
          currency: wallet.currency || 'NGN',
          status: PayoutStatus.PENDING,
          metadata: {
            source: 'PLAYER_PORTAL_WALLET',
            initialCashBalance: wallet.cashBalance,
            postDeductionCashBalance: newCashBalance,
          },
        },
      });

      // 6. Record debit in Ledger History
      const ledgerEntry = await tx.walletTransaction.create({
        data: {
          walletId: wallet.walletId,
          reference: txReference,
          type: WalletTransactionType.WITHDRAWAL_REQUEST,
          amount: -payoutAmount,
          balanceAfter: newCashBalance,
          currency: wallet.currency || 'NGN',
          status: TransactionStatus.PENDING,
          description: `Disburse Payout Settlement to ${dto.bankName || 'Bank'} [${cleanAccount}]`,
          metadata: {
            payoutId: payoutRecord.payoutId,
            payoutReference,
            accountNumber: cleanAccount,
          },
        },
      });

      // 7. Audit log activity
      await createActivities(
        this.prisma,
        'Payout Settlement Requested',
        `Player #${playerId} requested withdrawal of ₦${payoutAmount.toLocaleString()} to account ${cleanAccount}`,
        'PLAYER',
      );

      this.logger.log(
        `Dispatched payout request ${payoutReference} of ₦${payoutAmount} for player ${playerId}. New Cash: ₦${newCashBalance}`,
      );

      return {
        success: true,
        message: `Withdrawal request of ₦${payoutAmount.toLocaleString()} dispatched to clearing admin desk.`,
        data: {
          payoutId: payoutRecord.payoutId,
          reference: payoutReference,
          amount: payoutAmount,
          currency: wallet.currency || 'NGN',
          accountNumber: cleanAccount,
          status: payoutRecord.status,
          remainingCashBalance: newCashBalance,
          escrowBalance: newEscrowBalance,
          transactionId: ledgerEntry.transactionId,
          createdAt: payoutRecord.createdAt,
        },
      };
    });
  }

  /**
   * 4. Unified Wallet Hub Summary
   * High performance aggregation endpoint returning balances, active passes KPI,
   * and recent ledger transactions in a single network round-trip.
   */
  async getWalletOverview(playerId: string) {
    if (!playerId) {
      throw new BadRequestException('Player ID is required');
    }

    const wallet = await this.getOrCreateWallet(playerId);

    const [recentTx, registrationsCount] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.walletId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.tournamentRegistration.count({
        where: { playerId },
      }),
    ]);

    return {
      wallet: {
        walletId: wallet.walletId,
        cashBalance: wallet.cashBalance,
        creditBalance: wallet.creditBalance,
        escrowBalance: wallet.escrowBalance,
        totalBalance: wallet.cashBalance + wallet.creditBalance,
        currency: wallet.currency || 'NGN',
        status: wallet.status,
      },
      kpis: {
        totalCompetitorPasses: registrationsCount,
        recentLedgerCount: recentTx.length,
      },
      recentTransactions: recentTx.map((tx) => ({
        id: tx.transactionId,
        type: tx.type,
        displayType: tx.type.replace(/_/g, ' '),
        amount: tx.amount,
        balanceAfter: tx.balanceAfter,
        currency: tx.currency,
        status: tx.status,
        date: tx.createdAt.toISOString().split('T')[0],
      })),
    };
  }

  /**
   * 5. Admin / Tournament System Reward Crediting
   * Atomically credits tournament prize payouts or rewards directly to player's wallet.
   */
  async creditPlayerWallet(
    playerId: string,
    amount: number,
    type: WalletTransactionType = WalletTransactionType.PRIZE_PAYOUT,
    description: string = 'Tournament Prize Payout Credit',
  ) {
    if (amount <= 0) {
      throw new BadRequestException('Credit amount must be greater than zero');
    }

    return await this.prisma.$transaction(async (tx) => {
      const wallet = await this.getOrCreateWallet(playerId, tx);

      const newCashBalance = Number((wallet.cashBalance + amount).toFixed(2));

      await tx.wallet.update({
        where: { walletId: wallet.walletId },
        data: {
          cashBalance: newCashBalance,
        },
      });

      const uniqueSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
      const txReference = `WTX-CR-${Date.now().toString(36).toUpperCase()}-${uniqueSuffix}`;

      const ledgerEntry = await tx.walletTransaction.create({
        data: {
          walletId: wallet.walletId,
          reference: txReference,
          type,
          amount,
          balanceAfter: newCashBalance,
          currency: wallet.currency || 'NGN',
          status: TransactionStatus.SUCCESS,
          description,
        },
      });

      this.logger.log(
        `Credited ₦${amount} to Player ${playerId}. New Cash: ₦${newCashBalance}`,
      );

      return {
        success: true,
        transactionId: ledgerEntry.transactionId,
        reference: txReference,
        newCashBalance,
      };
    });
  }
}
