import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  ConflictException,
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
import { NotificationGateway } from '../../notification/notification.gateway';
import {
  CompletePayoutDto,
  FailPayoutDto,
  ReviewPayoutDto,
  StartPayoutProcessingDto,
} from '../dto/update-payout-status.dto';

@Injectable()
export class PlayerWalletService {
  private readonly logger = new Logger(PlayerWalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

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
          where: { status: { in: [PayoutStatus.PENDING, PayoutStatus.APPROVED, PayoutStatus.PROCESSING] } },
        },
      },
    });

    if (!wallet) {
      // Also check by userId fallback
      wallet = await client.wallet.findUnique({
        where: { userId: playerId },
        include: {
          payouts: {
            where: { status: { in: [PayoutStatus.PENDING, PayoutStatus.APPROVED, PayoutStatus.PROCESSING] } },
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
            where: { status: { in: [PayoutStatus.PENDING, PayoutStatus.APPROVED, PayoutStatus.PROCESSING] } },
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

  async getMyPayouts(
    playerId: string,
    options: { page?: number | string; limit?: number | string; reference?: string } = {},
  ) {
    const wallet = await this.getOrCreateWallet(playerId);
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const where = {
      playerId,
      ...(options.reference?.trim() ? { reference: options.reference.trim() } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.payoutRequest.count({ where }),
      this.prisma.payoutRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          payoutId: true,
          reference: true,
          bankName: true,
          accountName: true,
          accountNumber: true,
          amount: true,
          currency: true,
          status: true,
          rejectionReason: true,
          failureReason: true,
          transferReference: true,
          createdAt: true,
          updatedAt: true,
          processedAt: true,
          reviewedAt: true,
          reviewedBy: true,
          events: { orderBy: { createdAt: 'asc' } },
        },
      }),
    ]);
    return {
      walletId: wallet.walletId,
      items: items.map((item) => ({
        ...item,
        accountNumber: `******${item.accountNumber.slice(-4)}`,
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async listPayoutRequests(options: {
    status?: string;
    page?: number | string;
    limit?: number | string;
  } = {}) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const validStatuses = Object.values(PayoutStatus) as string[];
    if (options.status && !validStatuses.includes(options.status.toUpperCase())) {
      throw new BadRequestException(`Invalid payout status: ${options.status}`);
    }
    const where = options.status
      ? { status: options.status.toUpperCase() as PayoutStatus }
      : {};
    const [total, items] = await Promise.all([
      this.prisma.payoutRequest.count({ where }),
      this.prisma.payoutRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          player: {
            select: {
              playerId: true,
              showPlayerId: true,
              firstName: true,
              lastName: true,
              gamerTag: true,
              email: true,
              phoneNumber: true,
              documents: {
                select: { status: true, type: true },
              },
            },
          },
          events: { orderBy: { createdAt: 'asc' } },
        },
      }),
    ]);
    return {
      items,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async reviewPayout(payoutId: string, dto: ReviewPayoutDto, adminId: string, adminRole = 'ADMIN', adminEmail?: string) {
    if (dto.status === 'REJECTED' && !dto.rejectionReason?.trim()) {
      throw new BadRequestException('A reason is required when rejecting a payout.');
    }
    let notificationPlayerId: string | undefined;
    const result = await this.prisma.$transaction(async (tx) => {
      const payout = await tx.payoutRequest.findUnique({
        where: { payoutId },
        include: { player: { select: { documents: { where: { status: 'VERIFIED' }, select: { id: true } } } } },
      });
      if (!payout) throw new NotFoundException('Payout request not found');
      const reviewableStatuses: PayoutStatus[] = [PayoutStatus.PENDING, PayoutStatus.APPROVED];
      if (!reviewableStatuses.includes(payout.status)) {
        throw new ConflictException(`Cannot review a payout in ${payout.status} status.`);
      }
      if (dto.status === 'APPROVED') {
        if (!payout.player.documents.length) {
          throw new ForbiddenException('Player must have at least one verified identity document before payout approval.');
        }
        const result = await tx.payoutRequest.updateMany({
          where: { payoutId, status: payout.status },
          data: { status: PayoutStatus.APPROVED, reviewedAt: new Date(), reviewedBy: adminId },
        });
        if (!result.count) throw new ConflictException('Payout status changed; refresh and try again.');
        await this.recordPayoutEvent(tx, {
          payoutId,
          action: 'APPROVED',
          fromStatus: payout.status,
          toStatus: PayoutStatus.APPROVED,
          actorId: adminId,
          actorRole: adminRole,
          actorEmail: adminEmail,
        });
        const approvalMessage = `Your payout request ${payout.reference} was approved and is awaiting manual bank transfer processing. Approval does not mean the transfer is complete.`;
        await tx.notification.create({
          data: {
            userId: payout.playerId,
            status: 'INFORMATION',
            title: 'Payout request approved',
            description: approvalMessage,
          },
        });
        await tx.playerActivityLog.create({
          data: {
            playerId: payout.playerId,
            eventType: 'PAYOUT_APPROVED',
            title: 'Payout request approved',
            description: `${approvalMessage} Amount: ${payout.amount} ${payout.currency}.`,
            actorId: adminId,
            actorRole: adminRole,
            fromValue: payout.status,
            toValue: PayoutStatus.APPROVED,
          },
        });
        notificationPlayerId = payout.playerId;
      } else {
        await this.refundPayout(tx, payout, 'REJECTED', dto.rejectionReason!.trim(), adminId, adminRole, adminEmail);
        notificationPlayerId = payout.playerId;
      }
      return tx.payoutRequest.findUnique({ where: { payoutId } });
    });
    if (notificationPlayerId) this.notificationGateway.publishCreated(notificationPlayerId);
    return result;
  }

  async startPayoutProcessing(payoutId: string, dto: StartPayoutProcessingDto, adminId: string, adminRole = 'ADMIN', adminEmail?: string) {
    return this.prisma.$transaction(async (tx) => {
      const payout = await tx.payoutRequest.findUnique({ where: { payoutId } });
      if (!payout) throw new NotFoundException('Payout request not found');
      const result = await tx.payoutRequest.updateMany({
        where: { payoutId, status: PayoutStatus.APPROVED },
        data: {
          status: PayoutStatus.PROCESSING,
          transferReference: dto.transferReference.trim(),
          processedBy: adminId,
          processedAt: new Date(),
        },
      });
      if (!result.count) throw new ConflictException('Only approved payouts can be moved to processing.');
      await this.recordPayoutEvent(tx, {
        payoutId,
        action: 'PROCESSING',
        fromStatus: PayoutStatus.APPROVED,
        toStatus: PayoutStatus.PROCESSING,
        actorId: adminId,
        actorRole: adminRole,
        actorEmail: adminEmail,
        transferReference: dto.transferReference.trim(),
      });
      return tx.payoutRequest.findUnique({ where: { payoutId } });
    });
  }

  async completePayout(payoutId: string, dto: CompletePayoutDto, adminId: string, adminRole = 'ADMIN', adminEmail?: string) {
    return this.prisma.$transaction(async (tx) => {
      const payout = await tx.payoutRequest.findUnique({ where: { payoutId } });
      if (!payout) throw new NotFoundException('Payout request not found');
      if (payout.status !== PayoutStatus.PROCESSING) {
        throw new ConflictException('Only processing payouts can be completed.');
      }
      if (!payout.transferReference || payout.transferReference !== dto.transferReference.trim()) {
        throw new BadRequestException('Transfer reference does not match the processing record.');
      }
      const changed = await tx.payoutRequest.updateMany({
        where: { payoutId, status: PayoutStatus.PROCESSING },
        data: { status: PayoutStatus.COMPLETED, processedBy: adminId, processedAt: new Date() },
      });
      if (!changed.count) throw new ConflictException('Payout status changed; refresh and try again.');
      const released = await tx.wallet.updateMany({
        where: { walletId: payout.walletId, escrowBalance: { gte: payout.amount } },
        data: { escrowBalance: { decrement: payout.amount } },
      });
      if (!released.count) throw new ConflictException('Reserved payout funds are missing; contact finance support.');
      await this.updatePayoutLedger(tx, payout.payoutId, TransactionStatus.SUCCESS);
      await this.recordPayoutEvent(tx, {
        payoutId,
        action: 'COMPLETED',
        fromStatus: PayoutStatus.PROCESSING,
        toStatus: PayoutStatus.COMPLETED,
        actorId: adminId,
        actorRole: adminRole,
        actorEmail: adminEmail,
        transferReference: dto.transferReference.trim(),
      });
      return tx.payoutRequest.findUnique({ where: { payoutId } });
    });
  }

  async failPayout(payoutId: string, dto: FailPayoutDto, adminId: string, adminRole = 'ADMIN', adminEmail?: string) {
    let notificationPlayerId: string | undefined;
    const result = await this.prisma.$transaction(async (tx) => {
      const payout = await tx.payoutRequest.findUnique({ where: { payoutId } });
      if (!payout) throw new NotFoundException('Payout request not found');
      if (payout.status !== PayoutStatus.PROCESSING) {
        throw new ConflictException('Only processing payouts can be marked failed.');
      }
      await this.refundPayout(tx, payout, 'FAILED', dto.reason.trim(), adminId, adminRole, adminEmail);
      notificationPlayerId = payout.playerId;
      return tx.payoutRequest.findUnique({ where: { payoutId } });
    });
    if (notificationPlayerId) this.notificationGateway.publishCreated(notificationPlayerId);
    return result;
  }

  private async refundPayout(
    tx: any,
    payout: any,
    status: 'REJECTED' | 'FAILED',
    reason: string,
    adminId: string,
    adminRole = 'ADMIN',
    adminEmail?: string,
  ) {
    const allowed = status === 'REJECTED'
      ? [PayoutStatus.PENDING, PayoutStatus.APPROVED]
      : [PayoutStatus.PROCESSING];
    const changed = await tx.payoutRequest.updateMany({
      where: { payoutId: payout.payoutId, status: { in: allowed } },
      data: {
        status: status === 'REJECTED' ? PayoutStatus.REJECTED : PayoutStatus.FAILED,
        ...(status === 'REJECTED' ? { rejectionReason: reason } : { failureReason: reason }),
        ...(status === 'REJECTED' ? { reviewedAt: new Date(), reviewedBy: adminId } : {}),
        processedBy: adminId,
        processedAt: new Date(),
      },
    });
    if (!changed.count) throw new ConflictException('Payout status changed; refresh and try again.');

    const walletUpdate = await tx.wallet.updateMany({
      where: { walletId: payout.walletId, escrowBalance: { gte: payout.amount } },
      data: {
        cashBalance: { increment: payout.amount },
        escrowBalance: { decrement: payout.amount },
      },
    });
    if (!walletUpdate.count) throw new ConflictException('Reserved payout funds are missing; the refund was not applied.');
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { walletId: payout.walletId } });
    await this.updatePayoutLedger(
      tx,
      payout.payoutId,
      status === 'REJECTED' ? TransactionStatus.CANCELLED : TransactionStatus.FAILED,
    );
    await tx.walletTransaction.create({
      data: {
        walletId: payout.walletId,
        reference: `WTR-${crypto.randomBytes(12).toString('hex').toUpperCase()}`,
        type: WalletTransactionType.PAYOUT_REJECTED,
        amount: payout.amount,
        balanceAfter: wallet.cashBalance,
        currency: payout.currency,
        status: TransactionStatus.SUCCESS,
        description: `Payout ${status.toLowerCase()} refund: ${reason}`,
        metadata: { payoutId: payout.payoutId, payoutReference: payout.reference },
      },
    });
    const reasonMessage = status === 'REJECTED'
      ? `Your payout request ${payout.reference} was rejected. ${reason}`
      : `Your payout request ${payout.reference} failed and the reserved funds were returned. ${reason}`;
    await tx.notification.create({
      data: {
        userId: payout.playerId,
        status: 'ALERT',
        title: status === 'REJECTED' ? 'Payout request rejected' : 'Payout transfer failed',
        description: reasonMessage,
      },
    });
    await tx.playerActivityLog.create({
      data: {
        playerId: payout.playerId,
        eventType: status === 'REJECTED' ? 'PAYOUT_REJECTED' : 'PAYOUT_FAILED',
        title: status === 'REJECTED' ? 'Payout request rejected' : 'Payout transfer failed',
        description: `${reasonMessage} Refund of ${payout.amount} ${payout.currency} was returned to your withdrawable balance.`,
        actorId: adminId,
        actorRole: adminRole,
        fromValue: payout.status,
        toValue: status,
      },
    });
    await this.recordPayoutEvent(tx, {
      payoutId: payout.payoutId,
      action: status,
      fromStatus: payout.status,
      toStatus: status,
      actorId: adminId,
      actorRole: adminRole,
      actorEmail: adminEmail,
      reason,
    });
  }

  private async recordPayoutEvent(
    tx: any,
    event: {
      payoutId: string;
      action: string;
      fromStatus?: string | null;
      toStatus: string;
      actorId?: string | null;
      actorRole: string;
      actorEmail?: string | null;
      reason?: string | null;
      transferReference?: string | null;
    },
  ) {
    const admin = event.actorId && event.actorRole.toUpperCase() !== 'PLAYER'
      ? await tx.admin.findUnique({
          where: { adminId: event.actorId },
          select: { name: true, email: true },
        })
      : null;
    return tx.payoutRequestEvent.create({
      data: {
        payoutId: event.payoutId,
        action: event.action,
        fromStatus: event.fromStatus || null,
        toStatus: event.toStatus,
        actorId: event.actorId || null,
        actorRole: event.actorRole.toUpperCase(),
        actorName: admin?.name || null,
        actorEmail: admin?.email || event.actorEmail || null,
        reason: event.reason || null,
        transferReference: event.transferReference || null,
      },
    });
  }

  private async updatePayoutLedger(tx: any, payoutId: string, status: TransactionStatus) {
    const entry = await tx.walletTransaction.findFirst({
      where: {
        type: WalletTransactionType.WITHDRAWAL_REQUEST,
        metadata: { path: ['payoutId'], equals: payoutId },
      },
      select: { transactionId: true },
    });
    if (!entry) throw new NotFoundException('Payout ledger entry not found');
    await tx.walletTransaction.update({
      where: { transactionId: entry.transactionId },
      data: { status },
    });
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
  async requestPayout(playerId: string, dto: RequestPayoutDto, playerEmail?: string) {
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

      const newCashBalance = Number((wallet.cashBalance - payoutAmount).toFixed(2));
      const newEscrowBalance = Number((wallet.escrowBalance + payoutAmount).toFixed(2));

      // Compare-and-update prevents two simultaneous requests from spending the same balance.
      const reserved = await tx.wallet.updateMany({
        where: {
          walletId: wallet.walletId,
          status: WalletStatus.ACTIVE,
          cashBalance: { gte: payoutAmount },
        },
        data: {
          cashBalance: { decrement: payoutAmount },
          escrowBalance: { increment: payoutAmount },
        },
      });
      if (!reserved.count) {
        throw new BadRequestException('Available balance changed or is insufficient. Refresh your wallet and try again.');
      }

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

      await this.recordPayoutEvent(tx, {
        payoutId: payoutRecord.payoutId,
        action: 'REQUESTED',
        toStatus: PayoutStatus.PENDING,
        actorId: playerId,
        actorRole: 'PLAYER',
        actorEmail: playerEmail,
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
          description: `Disburse Payout Settlement to ${dto.bankName} [******${cleanAccount.slice(-4)}]`,
          metadata: {
            payoutId: payoutRecord.payoutId,
            payoutReference,
            accountLast4: cleanAccount.slice(-4),
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
