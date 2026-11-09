import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FanCoinRefillStatus, FanCoinTransactionType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateFanCoinRefillRequestDto } from '../dto/create-fan-coin-refill-request.dto';
import { ReviewFanCoinRefillRequestDto } from '../dto/review-fan-coin-refill-request.dto';

@Injectable()
export class FanCoinRefillService {
  constructor(private readonly prisma: PrismaService) {}

  async createRequest(fanId: string, dto: CreateFanCoinRefillRequestDto) {
    const fan = await this.prisma.fan.findFirst({
      where: { fanId, isDeleted: false, status: 'ACTIVE' },
      select: { fanId: true, coins: true },
    });
    if (!fan) throw new NotFoundException('Active fan account not found.');
    if (fan.coins > 0) {
      throw new BadRequestException(
        'You can request a coin refill after your coin balance reaches zero.',
      );
    }

    try {
      return await this.prisma.fanCoinRefillRequest.create({
        data: {
          fanId,
          pendingFanId: fanId,
          requestedCoins: dto.requestedCoins,
          reason: dto.reason?.trim() || null,
        },
        select: {
          requestId: true,
          requestedCoins: true,
          approvedCoins: true,
          reason: true,
          status: true,
          reviewNote: true,
          createdAt: true,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(
          'You already have a coin refill request waiting for admin review.',
        );
      }
      throw error;
    }
  }

  async listMyRequests(fanId: string) {
    const fan = await this.prisma.fan.findFirst({
      where: { fanId, isDeleted: false },
      select: { coins: true },
    });
    if (!fan) throw new NotFoundException('Fan account not found.');

    const requests = await this.prisma.fanCoinRefillRequest.findMany({
      where: { fanId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        requestId: true,
        requestedCoins: true,
        approvedCoins: true,
        reason: true,
        status: true,
        reviewNote: true,
        reviewedByEmail: true,
        reviewedAt: true,
        createdAt: true,
      },
    });
    return { balance: fan.coins, requests };
  }

  async listAdminRequests(options: { status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 25));
    const allowedStatuses = Object.values(FanCoinRefillStatus);
    const status = options.status?.toUpperCase();
    if (status && status !== 'ALL' && !allowedStatuses.includes(status as FanCoinRefillStatus)) {
      throw new BadRequestException('Unsupported coin refill request status.');
    }
    const where = status && status !== 'ALL'
      ? { status: status as FanCoinRefillStatus }
      : {};
    const [total, requests] = await this.prisma.$transaction([
      this.prisma.fanCoinRefillRequest.count({ where }),
      this.prisma.fanCoinRefillRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          fan: {
            select: {
              fanId: true,
              showFanId: true,
              firstName: true,
              surname: true,
              gamerTag: true,
              email: true,
              coins: true,
              status: true,
            },
          },
        },
      }),
    ]);

    return {
      items: requests,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async reviewRequest(
    requestId: string,
    dto: ReviewFanCoinRefillRequestDto,
    actor: { userId: string; role: string; email?: string },
  ) {
    if (dto.decision === 'APPROVED' && !dto.approvedCoins) {
      throw new BadRequestException('Enter the number of coins to grant.');
    }

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.fanCoinRefillRequest.findUnique({
        where: { requestId },
      });
      if (!request) throw new NotFoundException('Coin refill request not found.');
      if (request.status !== FanCoinRefillStatus.PENDING) {
        throw new ConflictException('This coin refill request has already been reviewed.');
      }

      const approvedCoins = dto.decision === 'APPROVED' ? dto.approvedCoins! : null;
      const claimed = await tx.fanCoinRefillRequest.updateMany({
        where: { requestId, status: FanCoinRefillStatus.PENDING },
        data: {
          status: dto.decision,
          approvedCoins,
          reviewNote: dto.reviewNote?.trim() || null,
          reviewedById: actor.userId,
          reviewedByRole: actor.role,
          reviewedByEmail: actor.email || null,
          reviewedAt: new Date(),
          pendingFanId: null,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('This coin refill request has already been reviewed.');
      }

      let balance: number | null = null;
      if (dto.decision === 'APPROVED') {
        const fan = await tx.fan.update({
          where: { fanId: request.fanId },
          data: { coins: { increment: approvedCoins! } },
          select: { coins: true },
        });
        balance = fan.coins;
        await tx.fanCoinTransaction.create({
          data: {
            fanId: request.fanId,
            type: FanCoinTransactionType.ADMIN_CREDIT,
            amount: approvedCoins!,
            balanceAfter: fan.coins,
            description: `Admin-approved coin refill request ${request.requestId}`,
          },
        });
      }

      const updated = await tx.fanCoinRefillRequest.findUnique({
        where: { requestId },
        include: {
          fan: {
            select: { fanId: true, firstName: true, surname: true, email: true, coins: true },
          },
        },
      });
      return { request: updated, balance };
    });
  }
}
