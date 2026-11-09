import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Currency } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { FlutterwaveService } from '../../flutterwave/service/flutterwave.service';

type RefillPackage = {
  id: string;
  label: string;
  amount: number;
  price: number;
  currency: Currency;
};
type RefillKind = 'coins' | 'credits';

@Injectable()
export class PlayerRefillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly flutterwave: FlutterwaveService,
  ) {}

  getPackages() {
    return {
      cashCredits: this.parsePackages('PLAYER_CASH_CREDIT_PACKAGES', 'credits'),
    };
  }

  private parsePackages(
    key: string,
    amountKey: 'coins' | 'credits',
  ): RefillPackage[] {
    const raw = this.config.get<string>(key);
    if (!raw?.trim()) return [];
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new ServiceUnavailableException(`${key} is not valid JSON.`);
    }
    if (!Array.isArray(data)) {
      throw new ServiceUnavailableException(`${key} must be a JSON array.`);
    }
    const seen = new Set<string>();
    return data.map((item: any) => {
      const currency = String(item?.currency || '').toUpperCase();
      const amount = Number(item?.[amountKey]);
      if (
        typeof item?.id !== 'string' ||
        !item.id.trim() ||
        seen.has(item.id) ||
        typeof item?.label !== 'string' ||
        !item.label.trim() ||
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        !Number.isFinite(item?.price) ||
        item.price <= 0 ||
        !Object.values(Currency).includes(currency as Currency)
      ) {
        throw new ServiceUnavailableException(
          `${key} contains an invalid package.`,
        );
      }
      seen.add(item.id);
      return {
        id: item.id,
        label: item.label,
        amount,
        price: item.price,
        currency: currency as Currency,
      };
    });
  }

  async startPurchase(playerId: string, kind: RefillKind, packageId: string) {
    const configKey =
      kind === 'coins' ? 'FAN_COIN_PACKAGES' : 'PLAYER_CASH_CREDIT_PACKAGES';
    const amountKey = kind === 'coins' ? 'coins' : 'credits';
    const packageInfo = this.parsePackages(configKey, amountKey).find(
      (item) => item.id === packageId,
    );
    if (!packageInfo)
      throw new BadRequestException(
        'The selected refill package is unavailable.',
      );

    const player = await this.prisma.player.findFirst({
      where: { playerId, isDeleted: false, status: 'ACTIVE' },
      select: {
        playerId: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
      },
    });
    if (!player)
      throw new NotFoundException('Active player account not found.');
    if (kind === 'credits') {
      const wallet = await this.prisma.wallet.findFirst({
        where: { OR: [{ playerId }, { userId: playerId }] },
        select: { currency: true },
      });
      if ((wallet?.currency || 'NGN') !== packageInfo.currency) {
        throw new BadRequestException(
          'Wallet credit packages must use the Player wallet currency.',
        );
      }
    }

    const purpose =
      kind === 'coins' ? 'PLAYER_COIN_PURCHASE' : 'PLAYER_CASH_CREDIT_PURCHASE';
    const txRef = `FLW-${kind === 'coins' ? 'PCOIN' : 'PCREDIT'}-${randomUUID()}`;
    const details = {
      purpose,
      playerId,
      packageId: packageInfo.id,
      label: packageInfo.label,
      amount: packageInfo.amount,
    };
    const payment = await this.prisma.payment.create({
      data: {
        purchaserId: playerId,
        purchaserRole: 'PLAYER',
        purpose,
        gateway: 'FLUTTERWAVE',
        status: 'PENDING',
        amount: packageInfo.price,
        currency: packageInfo.currency,
        txRef,
        providerDetails: details,
      },
    });

    try {
      const frontendUrl = (
        this.config.get<string>('FRONTEND_URL') || 'http://localhost:3004'
      ).replace(/\/$/, '');
      const checkout = await this.flutterwave.initializePayment({
        email: player.email,
        amount: packageInfo.price,
        currency: packageInfo.currency,
        name: `${player.firstName} ${player.lastName}`.trim(),
        phoneNumber: player.phoneNumber,
        redirectUrl: `${frontendUrl}/?payment=player-${kind}`,
        title:
          kind === 'coins'
            ? 'Player coin refill'
            : 'Player wallet credit refill',
        description: `${packageInfo.amount} ${kind === 'coins' ? 'coins' : 'wallet credits'} - ${packageInfo.label}`,
        txRef,
        meta: details,
      });
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          checkoutUrl: checkout.link,
          providerDetails: { ...details, checkoutUrl: checkout.link },
        },
      });
      return {
        txRef,
        checkoutUrl: checkout.link,
        package: packageInfo,
        status: 'PENDING',
      };
    } catch (error) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'INITIALIZATION_FAILED' },
      });
      throw error;
    }
  }

  async verifyPurchase(playerId: string, kind: RefillKind, txRef: string) {
    const purpose =
      kind === 'coins' ? 'PLAYER_COIN_PURCHASE' : 'PLAYER_CASH_CREDIT_PURCHASE';
    const payment = await this.prisma.payment.findFirst({
      where: {
        txRef,
        purchaserId: playerId,
        purchaserRole: 'PLAYER',
        purpose,
        gateway: 'FLUTTERWAVE',
      },
    });
    if (!payment)
      throw new NotFoundException('Player refill payment was not found.');
    const details = payment.providerDetails as Record<string, any> | null;
    const amount = Number(details?.amount);
    if (
      details?.playerId !== playerId ||
      details?.purpose !== purpose ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      throw new BadRequestException(
        'Player refill payment details are invalid.',
      );
    }

    if (payment.status !== 'SUCCESS') {
      const transaction = await this.flutterwave.verifyTransactionByRef(txRef);
      if (
        transaction.txRef !== txRef ||
        transaction.meta?.purpose !== purpose ||
        transaction.meta?.playerId !== playerId ||
        transaction.meta?.packageId !== details.packageId ||
        transaction.status?.toLowerCase() !== 'successful' ||
        Number(transaction.amount) < payment.amount ||
        transaction.currency?.toUpperCase() !== payment.currency
      ) {
        throw new BadRequestException(
          'Flutterwave has not confirmed this payment in full.',
        );
      }

      return this.prisma.$transaction(async (tx) => {
        const claimed = await tx.payment.updateMany({
          where: { id: payment.id, status: 'PENDING' },
          data: {
            status: 'SUCCESS',
            flwTransactionId: String(transaction.id),
            paidAmount: Number(transaction.amount),
            paidCurrency: payment.currency,
            paidAt: transaction.createdAt
              ? new Date(transaction.createdAt)
              : new Date(),
            providerDetails: { ...details, flutterwave: transaction.raw },
          },
        });
        if (claimed.count === 0) {
          const latest = await tx.payment.findUnique({
            where: { id: payment.id },
          });
          if (latest?.status === 'SUCCESS') {
            return kind === 'coins'
              ? {
                  status: 'SUCCESS',
                  balance: (
                    await tx.player.findUniqueOrThrow({
                      where: { playerId },
                      select: { coins: true },
                    })
                  ).coins,
                  alreadyProcessed: true,
                }
              : {
                  status: 'SUCCESS',
                  balance: (
                    await tx.wallet.findFirstOrThrow({
                      where: { OR: [{ playerId }, { userId: playerId }] },
                      select: { creditBalance: true },
                    })
                  ).creditBalance,
                  alreadyProcessed: true,
                };
          }
          throw new BadRequestException(
            'This refill payment cannot be completed.',
          );
        }

        if (kind === 'coins') {
          const player = await tx.player.update({
            where: { playerId },
            data: { coins: { increment: amount } },
            select: { coins: true },
          });
          await tx.playerCoinTransaction.create({
            data: {
              playerId,
              paymentId: payment.id,
              amount,
              balanceAfter: player.coins,
              description: `Purchased ${amount} coins (${details.label})`,
            },
          });
          return {
            status: 'SUCCESS',
            amountAdded: amount,
            balance: player.coins,
            alreadyProcessed: false,
          };
        }

        const existingWallet = await tx.wallet.findFirst({
          where: { OR: [{ playerId }, { userId: playerId }] },
          select: { walletId: true },
        });
        const wallet = existingWallet
          ? await tx.wallet.update({
              where: { walletId: existingWallet.walletId },
              data: { creditBalance: { increment: amount } },
              select: { walletId: true, creditBalance: true },
            })
          : await tx.wallet.create({
              data: {
                playerId,
                userId: playerId,
                userRole: 'PLAYER',
                currency: payment.currency,
                creditBalance: amount,
              },
              select: { walletId: true, creditBalance: true },
            });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.walletId,
            reference: `WCR-${txRef}`,
            type: 'CREDIT_ADJUSTMENT',
            amount,
            balanceAfter: wallet.creditBalance,
            currency: payment.currency,
            status: 'SUCCESS',
            description: `Purchased ${amount} non-withdrawable wallet credits (${details.label})`,
            metadata: { paymentId: payment.id, txRef, withdrawable: false },
          },
        });
        return {
          status: 'SUCCESS',
          amountAdded: amount,
          balance: wallet.creditBalance,
          withdrawable: false,
          alreadyProcessed: false,
        };
      });
    }

    if (kind === 'coins') {
      const posting = await this.prisma.playerCoinTransaction.findUnique({
        where: { paymentId: payment.id },
      });
      if (!posting)
        throw new BadRequestException(
          'Coin refill is still processing. Please retry shortly.',
        );
      return {
        status: 'SUCCESS',
        amountAdded: posting.amount,
        balance: posting.balanceAfter,
        alreadyProcessed: true,
      };
    }
    const walletPosting = await this.prisma.walletTransaction.findUnique({
      where: { reference: `WCR-${txRef}` },
    });
    if (!walletPosting)
      throw new BadRequestException(
        'Wallet credit refill is still processing. Please retry shortly.',
      );
    return {
      status: 'SUCCESS',
      amountAdded: walletPosting.amount,
      balance: walletPosting.balanceAfter,
      withdrawable: false,
      alreadyProcessed: true,
    };
  }
}
