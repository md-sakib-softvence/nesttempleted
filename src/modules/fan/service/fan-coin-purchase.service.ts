import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Currency, FanCoinTransactionType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { FlutterwaveService } from '../../flutterwave/service/flutterwave.service';

type CoinPackage = {
  id: string;
  label: string;
  coins: number;
  price: number;
  currency: Currency;
};

@Injectable()
export class FanCoinPurchaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly flutterwave: FlutterwaveService,
  ) {}

  getPackages(): CoinPackage[] {
    const raw = this.configService.get<string>('FAN_COIN_PACKAGES');
    if (!raw?.trim()) return [];

    let configured: unknown;
    try {
      configured = JSON.parse(raw);
    } catch {
      throw new ServiceUnavailableException(
        'Fan coin packages are not configured correctly.',
      );
    }
    if (!Array.isArray(configured)) {
      throw new ServiceUnavailableException(
        'Fan coin packages must be a JSON array.',
      );
    }

    const supportedCurrencies = Object.values(Currency);
    const ids = new Set<string>();
    return configured.map((item: any) => {
      const currency = String(item?.currency || '').toUpperCase();
      if (
        !item ||
        typeof item.id !== 'string' ||
        !item.id.trim() ||
        ids.has(item.id) ||
        typeof item.label !== 'string' ||
        !item.label.trim() ||
        !Number.isSafeInteger(item.coins) ||
        item.coins <= 0 ||
        !Number.isFinite(item.price) ||
        item.price <= 0 ||
        !supportedCurrencies.includes(currency as Currency)
      ) {
        throw new ServiceUnavailableException(
          'A fan coin package has invalid or duplicate values.',
        );
      }
      ids.add(item.id);
      return {
        id: item.id,
        label: item.label,
        coins: item.coins,
        price: item.price,
        currency: currency as Currency,
      };
    });
  }

  async startPurchase(fanId: string, packageId: string) {
    const packageInfo = this.getPackages().find((item) => item.id === packageId);
    if (!packageInfo) {
      throw new BadRequestException('The selected coin package is unavailable.');
    }

    const fan = await this.prisma.fan.findFirst({
      where: { fanId, isDeleted: false, status: 'ACTIVE' },
      select: {
        fanId: true,
        email: true,
        firstName: true,
        surname: true,
        phoneNumber: true,
      },
    });
    if (!fan) throw new NotFoundException('Active fan account not found.');

    const txRef = `FLW-COIN-${randomUUID()}`;
    const frontendUrl = (
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173'
    ).replace(/\/$/, '');
    const payment = await this.prisma.payment.create({
      data: {
        purchaserId: fanId,
        purchaserRole: 'FAN',
        purpose: 'FAN_COIN_PURCHASE',
        gateway: 'FLUTTERWAVE',
        status: 'PENDING',
        amount: packageInfo.price,
        currency: packageInfo.currency,
        txRef,
        providerDetails: {
          purpose: 'FAN_COIN_PURCHASE',
          packageId: packageInfo.id,
          label: packageInfo.label,
          coins: packageInfo.coins,
          fanId,
        },
      },
    });

    try {
      const checkout = await this.flutterwave.initializePayment({
        email: fan.email,
        amount: packageInfo.price,
        currency: packageInfo.currency,
        name: `${fan.firstName} ${fan.surname || ''}`.trim(),
        phoneNumber: fan.phoneNumber,
        redirectUrl: `${frontendUrl}/?payment=fan-coins`,
        title: 'Fan coin purchase',
        description: `${packageInfo.coins} coins — ${packageInfo.label}`,
        txRef,
        meta: {
          purpose: 'FAN_COIN_PURCHASE',
          packageId: packageInfo.id,
          coins: packageInfo.coins,
          fanId,
        },
      });
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          checkoutUrl: checkout.link,
          providerDetails: {
            purpose: 'FAN_COIN_PURCHASE',
            packageId: packageInfo.id,
            label: packageInfo.label,
            coins: packageInfo.coins,
            fanId,
            checkoutUrl: checkout.link,
          },
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

  async verifyPurchase(fanId: string, txRef: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        txRef,
        purchaserId: fanId,
        purchaserRole: 'FAN',
        purpose: 'FAN_COIN_PURCHASE',
        gateway: 'FLUTTERWAVE',
      },
    });
    if (!payment) throw new NotFoundException('Coin purchase was not found.');

    const providerDetails = payment.providerDetails as Record<string, any> | null;
    const coins = Number(providerDetails?.coins);
    const packageLabel = String(providerDetails?.label || 'Coin package');
    if (
      !providerDetails?.packageId ||
      !Number.isSafeInteger(coins) ||
      coins <= 0 ||
      providerDetails?.fanId !== fanId
    ) {
      throw new BadRequestException('Coin purchase details are invalid.');
    }

    if (payment.status !== 'SUCCESS') {
      const transaction = await this.flutterwave.verifyTransactionByRef(txRef);
      if (
        transaction.txRef !== txRef ||
        transaction.meta?.purpose !== 'FAN_COIN_PURCHASE' ||
        transaction.meta?.fanId !== fanId ||
        transaction.meta?.packageId !== providerDetails.packageId ||
        transaction.status?.toLowerCase() !== 'successful' ||
        Number(transaction.amount) < payment.amount ||
        transaction.currency?.toUpperCase() !== payment.currency
      ) {
        throw new BadRequestException(
          'Flutterwave has not confirmed this coin purchase in full.',
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
            paidAt: transaction.createdAt ? new Date(transaction.createdAt) : new Date(),
            providerDetails: {
              ...providerDetails,
              flutterwave: transaction.raw,
            },
          },
        });

        if (claimed.count === 0) {
          const latest = await tx.payment.findUnique({
            where: { id: payment.id },
            include: { coinTransaction: true },
          });
          if (latest?.status === 'SUCCESS' && latest.coinTransaction) {
            return {
              status: 'SUCCESS',
              coinsAdded: latest.coinTransaction.amount,
              balance: latest.coinTransaction.balanceAfter,
              alreadyProcessed: true,
            };
          }
          throw new BadRequestException('This coin purchase cannot be completed.');
        }

        const updatedFan = await tx.fan.update({
          where: { fanId },
          data: { coins: { increment: coins } },
          select: { coins: true },
        });
        await tx.fanCoinTransaction.create({
          data: {
            fanId,
            paymentId: payment.id,
            type: FanCoinTransactionType.PURCHASE_CREDIT,
            amount: coins,
            balanceAfter: updatedFan.coins,
            description: `Purchased ${coins} coins (${packageLabel})`,
          },
        });
        return {
          status: 'SUCCESS',
          coinsAdded: coins,
          balance: updatedFan.coins,
          alreadyProcessed: false,
        };
      });
    }

    const completed = await this.prisma.payment.findUnique({
      where: { id: payment.id },
      include: { coinTransaction: true },
    });
    if (!completed?.coinTransaction) {
      throw new BadRequestException(
        'Coin credit is still processing. Please retry shortly.',
      );
    }
    return {
      status: 'SUCCESS',
      coinsAdded: completed.coinTransaction.amount,
      balance: completed.coinTransaction.balanceAfter,
      alreadyProcessed: true,
    };
  }
}
