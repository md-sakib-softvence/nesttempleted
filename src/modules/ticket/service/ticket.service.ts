import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { FlutterwaveService } from '../../flutterwave/service/flutterwave.service';
import { PurchaseTicketDto } from '../dto/purchase-ticket.dto';
import { CheckInTicketDto } from '../dto/check-in-ticket.dto';
import { CreateTierDto } from '../dto/create-tier.dto';
import { UpdateTierDto } from '../dto/update-tier.dto';
import { QueryTicketDto } from '../dto/query-ticket.dto';
import { TransferTicketDto } from '../dto/transfer-ticket.dto';
import { TicketStatus, TicketType } from '@prisma/client';
import { TicketScanGateway } from '../gateway/ticket-scan.gateway';
import * as crypto from 'crypto';

@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flutterwaveService: FlutterwaveService,
    private readonly ticketScanGateway: TicketScanGateway,
  ) {}

  /**
   * Resolve user profile details (Fan or Player)
   */
  private async resolvePurchaser(userId: string, roleHint?: string) {
    const roleStr = String(roleHint || '').toUpperCase();
    const isPlayerRole = roleStr.includes('PLAYER');

    if (isPlayerRole) {
      const player = await this.prisma.player.findFirst({
        where: { playerId: userId, isDeleted: false },
        select: {
          playerId: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          gamerTag: true,
        },
      });
      if (player) {
        return {
          userType: 'PLAYER' as const,
          playerId: player.playerId,
          fanId: null,
          name: `${player.firstName} ${player.lastName}`.trim(),
          email: player.email,
          phone: player.phoneNumber,
        };
      }
    }

    // Try Fan table
    const fan = await this.prisma.fan.findFirst({
      where: { fanId: userId, isDeleted: false },
      select: {
        fanId: true,
        firstName: true,
        surname: true,
        email: true,
        phoneNumber: true,
        gamerTag: true,
      },
    });

    if (fan) {
      return {
        userType: 'FAN' as const,
        playerId: null,
        fanId: fan.fanId,
        name: `${fan.firstName} ${fan.surname || ''}`.trim(),
        email: fan.email,
        phone: fan.phoneNumber,
      };
    }

    // Fallback: check player table if role was not specified
    const playerFallback = await this.prisma.player.findFirst({
      where: { playerId: userId, isDeleted: false },
      select: {
        playerId: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        gamerTag: true,
      },
    });

    if (playerFallback) {
      return {
        userType: 'PLAYER' as const,
        playerId: playerFallback.playerId,
        fanId: null,
        name: `${playerFallback.firstName} ${playerFallback.lastName}`.trim(),
        email: playerFallback.email,
        phone: playerFallback.phoneNumber,
      };
    }

    // Admin / Guest fallback
    return {
      userType: 'FAN' as const,
      playerId: null,
      fanId: null,
      name: 'Guest Spectator',
      email: null,
      phone: null,
    };
  }

  /**
   * 1. Calculate Tournament Capacity, Available Seats, and Financial Summary
   */
  async calculateTournamentCapacityAndSeats(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      include: {
        ticketTiers: true,
        tickets: {
          where: {
            status: { in: [TicketStatus.ACTIVE, TicketStatus.USED] },
          },
          select: {
            ticketId: true,
            pricePaid: true,
            checkedIn: true,
            seatNumber: true,
            type: true,
          },
        },
      },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const tierCapacity = tournament.ticketTiers
      .filter((tier) => tier.status === 'ACTIVE')
      .reduce((sum, tier) => sum + Math.max(0, tier.capacity), 0);
    const totalCapacity = tournament.capacity > 0 ? tournament.capacity : tierCapacity;
    const totalSold = tournament.tickets.length;
    const availableSeats = Math.max(0, totalCapacity - totalSold);
    const occupancyRate =
      totalCapacity > 0
        ? Number(((totalSold / totalCapacity) * 100).toFixed(2))
        : 0;

    const totalRevenue = tournament.tickets.reduce(
      (sum, t) => sum + (t.pricePaid || 0),
      0,
    );
    const totalCheckIns = tournament.tickets.filter((t) => t.checkedIn).length;
    const checkInRate =
      totalSold > 0
        ? Number(((totalCheckIns / totalSold) * 100).toFixed(2))
        : 0;

    const tiers = tournament.ticketTiers.map((tier) => {
      const tierRemaining = Math.max(0, tier.capacity - tier.sold);
      return {
        tierId: tier.tierId,
        name: tier.name,
        type: tier.type,
        price: tier.price,
        currency: tier.currency,
        capacity: tier.capacity,
        sold: tier.sold,
        availableSeats: tierRemaining,
        status: tier.status,
      };
    });

    return {
      tournamentId: tournament.tournamentId,
      tournamentName: tournament.name,
      currency: tournament.currency,
      status: tournament.status,
      totalCapacity,
      soldTickets: totalSold,
      availableSeats,
      remainingSeats: availableSeats,
      occupancyRate,
      totalRevenue,
      totalCheckIns,
      checkInRate,
      tiers,
    };
  }

  /**
   * 2. Initialize Ticket Purchase Flow with Flutterwave
   */
  async initializePurchase(
    currentUser: { userId: string; role?: string },
    dto: PurchaseTicketDto,
  ) {
    if (!currentUser?.userId) {
      throw new UnauthorizedException(
        'Authentication required to purchase tickets',
      );
    }

    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId: dto.tournamentId },
      include: {
        ticketTiers: true,
      },
    });

    if (!tournament || tournament.isDeleted) {
      throw new NotFoundException(`Tournament #${dto.tournamentId} not found`);
    }

    const quantity = dto.quantity && dto.quantity > 0 ? dto.quantity : 1;

    if (quantity !== 1) {
      throw new BadRequestException(
        'Only one ticket may be purchased per fan for a tournament.',
      );
    }

    const purchaser = await this.resolvePurchaser(
      currentUser.userId,
      currentUser.role,
    );

    // Check ownership before capacity/pricing so a duplicate always receives
    // the correct message instead of a misleading seats or tier error.
    const ownerFilters: Array<Record<string, string>> = [
      { purchasedBy: currentUser.userId },
    ];
    if (purchaser.fanId) ownerFilters.push({ fanId: purchaser.fanId });
    if (purchaser.playerId) ownerFilters.push({ playerId: purchaser.playerId });

    const existingTicket = await this.prisma.ticket.findFirst({
      where: {
        tournamentId: dto.tournamentId,
        status: { in: [TicketStatus.ACTIVE, TicketStatus.USED] },
        OR: ownerFilters,
      },
      select: { showTicketId: true, type: true, status: true },
    });
    if (existingTicket) {
      throw new ConflictException(
        `You already have a ticket for "${tournament.name}". One ticket per fan is allowed.`,
      );
    }

    // Check overall tournament capacity. If the tournament-level capacity is
    // unset, the active tier capacities are the source of truth.
    const tierCapacity = tournament.ticketTiers
      .filter((tier) => tier.status === 'ACTIVE')
      .reduce((sum, tier) => sum + Math.max(0, tier.capacity), 0);
    const effectiveCapacity = tournament.capacity > 0 ? tournament.capacity : tierCapacity;
    const currentTotalSold = await this.prisma.ticket.count({
      where: {
        tournamentId: dto.tournamentId,
        status: { in: [TicketStatus.ACTIVE, TicketStatus.USED] },
      },
    });

    if (
      effectiveCapacity > 0 &&
      currentTotalSold + quantity > effectiveCapacity
    ) {
      const remaining = Math.max(0, effectiveCapacity - currentTotalSold);
      throw new BadRequestException(
        `Not enough seats available. Tournament capacity reached. Remaining seats: ${remaining}`,
      );
    }

    // Determine tier & pricing
    let selectedTier: any = null;
    let unitPrice = 0;
    let ticketType: TicketType = dto.type || TicketType.DAY_PASS;

    if (dto.tierId) {
      selectedTier = tournament.ticketTiers.find(
        (t) => t.tierId === dto.tierId,
      );
      if (!selectedTier) {
        throw new NotFoundException(
          `Ticket Tier #${dto.tierId} not found for this tournament`,
        );
      }
      if (selectedTier.status !== 'ACTIVE') {
        throw new BadRequestException(
          'This ticket tier is currently not active',
        );
      }
      if (selectedTier.sold + quantity > selectedTier.capacity) {
        const remainingTier = Math.max(
          0,
          selectedTier.capacity - selectedTier.sold,
        );
        throw new BadRequestException(
          `Selected tier has only ${remainingTier} ticket(s) left`,
        );
      }
      unitPrice = selectedTier.price;
      ticketType = selectedTier.type;
    } else {
      unitPrice = tournament.entryFee;
    }

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new BadRequestException(
        'No payable ticket tier or entry fee is configured for this tournament.',
      );
    }

    const totalAmount = unitPrice * quantity;

    if (!purchaser.email) {
      throw new BadRequestException(
        'A valid email address is required before starting checkout.',
      );
    }
    const customerEmail = purchaser.email;
    const customerName = purchaser.name || 'Spectator';
    const customerPhone = purchaser.phone || undefined;

    // This flow uses aggregate capacity only; no physical seat map is configured.
    const seatNumber = null;

    const txRef = `FLW-TCK-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    const envRedirectUrl =
      process.env.TICKET_REDIRECT_URL ||
      `${process.env.FRONTEND_URL || 'https://tapegaming.com'}/tickets/verify`;
    const finalRedirectUrl = envRedirectUrl.includes('?')
      ? `${envRedirectUrl}&tx_ref=${txRef}`
      : `${envRedirectUrl}?tx_ref=${txRef}`;

    const flwPayload = {
      txRef,
      amount: totalAmount,
      currency: tournament.currency || 'NGN',
      email: customerEmail,
      name: customerName,
      phoneNumber: customerPhone,
      redirectUrl: finalRedirectUrl,
      title: `${tournament.name} - Ticket Purchase`,
      description: `${ticketType} (${quantity}x) for ${tournament.name}`,
      meta: {
        tournamentId: tournament.tournamentId,
        tierId: selectedTier?.tierId || null,
        ticketType,
        quantity,
        seatNumber,
        userId: currentUser.userId,
        userRole: purchaser.userType,
      },
    };

    const pendingPayment = await this.prisma.payment.create({
      data: {
        tournamentId: tournament.tournamentId,
        purchaserId: currentUser.userId,
        purchaserRole: purchaser.userType,
        ticketTierId: selectedTier?.tierId || null,
        quantity,
        seatNumber,
        purpose: 'SPECTATOR_TICKET_PURCHASE',
        gateway: 'FLUTTERWAVE',
        status: 'PENDING',
        amount: totalAmount,
        currency: tournament.currency || 'NGN',
        txRef,
        providerDetails: {
          tournamentId: tournament.tournamentId,
          tierId: selectedTier?.tierId || null,
          ticketType,
          quantity,
          seatNumber,
          userId: currentUser.userId,
          userRole: purchaser.userType,
        },
      },
    });

    let flwInit;
    try {
      flwInit = await this.flutterwaveService.initializePayment(flwPayload);
    } catch (error) {
      await this.prisma.payment.update({
        where: { id: pendingPayment.id },
        data: { status: 'FAILED' },
      });
      throw error;
    }

    await this.prisma.payment.update({
      where: { id: pendingPayment.id },
      data: {
        checkoutUrl: flwInit.link,
        providerDetails: {
          ...(pendingPayment.providerDetails as Record<string, unknown>),
          checkoutUrl: flwInit.link,
        },
      },
    });

    const baseUrl = process.env.FRONTEND_URL || 'https://tapegaming.com';
    const rolePath = purchaser.userType === 'PLAYER' ? 'player' : 'fan';
    const digitalPassLink = `${baseUrl}/${rolePath}/tickets`;

    return {
      paymentLink: flwInit.link,
      txRef: flwInit.txRef,
      redirectUrl: finalRedirectUrl,
      digitalPassLink,
      amount: totalAmount,
      currency: tournament.currency || 'NGN',
      quantity,
      ticketType,
      seatNumber,
      purchaserRole: purchaser.userType,
      purchaserId: currentUser.userId,
      purchaserName: customerName,
      tournamentName: tournament.name,
      oneTicketOneTimeOnly: true,
      canBuyMultipleTimes: false,
    };
  }

  /**
   * 3. Verify Payment and Issue Ticket
   */
  async verifyPaymentAndIssueTicket(
    txRef: string,
    transactionId?: string | number,
  ) {
    if (!txRef) {
      throw new BadRequestException(
        'Transaction reference (txRef) is required',
      );
    }

    // 1. Check if tickets were already issued for this txRef
    const existingTickets = await this.prisma.ticket.findMany({
      where: { paymentReference: txRef },
      include: {
        tournament: {
          select: {
            tournamentId: true,
            name: true,
            startDate: true,
            currency: true,
          },
        },
      },
    });

    if (existingTickets.length > 0) {
      return {
        verified: true,
        alreadyProcessed: true,
        tickets: existingTickets,
      };
    }

    // 2. Verify with Flutterwave API
    let txData: any;
    if (transactionId) {
      txData = await this.flutterwaveService.verifyTransaction(transactionId);
    } else {
      txData = await this.flutterwaveService.verifyTransactionByRef(txRef);
    }

    if (txData.status !== 'successful') {
      await this.prisma.payment.updateMany({
        where: { txRef },
        data: { status: String(txData.status || 'FAILED').toUpperCase() },
      });
      throw new BadRequestException(
        `Payment was not successful. Flutterwave status: ${txData.status}`,
      );
    }

    // Persist the gateway result independently of issued tickets. This keeps
    // the payment ledger auditable and makes webhook/redirect retries idempotent.
    await this.prisma.payment.updateMany({
      where: { txRef },
      data: {
        status: 'SUCCESS',
        flwTransactionId: String(txData.id),
        paidAmount: txData.chargedAmount || txData.amount,
        paidCurrency: txData.currency,
        paidAt: txData.createdAt ? new Date(txData.createdAt) : new Date(),
        providerDetails: txData.raw || txData,
      },
    });

    const meta = txData.meta || {};
    const tournamentId = meta.tournamentId;

    if (!tournamentId) {
      await this.prisma.payment.updateMany({
        where: { txRef },
        data: { status: 'INVALID_METADATA' },
      });
      throw new BadRequestException(
        'Invalid transaction metadata: missing tournamentId',
      );
    }

    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId },
      include: { ticketTiers: true },
    });

    if (!tournament) {
      await this.prisma.payment.updateMany({
        where: { txRef },
        data: { status: 'INVALID_TOURNAMENT' },
      });
      throw new NotFoundException(`Tournament #${tournamentId} not found`);
    }

    const quantity = Number(meta.quantity) || 1;
    const ticketType: TicketType =
      meta.ticketType && Object.values(TicketType).includes(meta.ticketType)
        ? meta.ticketType
        : TicketType.DAY_PASS;
    const tierId = meta.tierId || null;
    const userId = meta.userId || null;
    const userRole = meta.userRole || 'FAN';

    if (quantity !== 1) {
      await this.prisma.payment.updateMany({
        where: { txRef },
        data: { status: 'DUPLICATE_TICKET' },
      });
      throw new ConflictException(
        'Only one ticket may be issued to a fan for a tournament.',
      );
    }

    const selectedTier = tierId
      ? tournament.ticketTiers.find((tier) => tier.tierId === tierId)
      : undefined;
    const expectedUnitPrice = selectedTier?.price ?? tournament.entryFee;
    const expectedAmount = Number((expectedUnitPrice * quantity).toFixed(2));
    const chargedAmount = Number(txData.amount);
    if (!Number.isFinite(chargedAmount) || Math.abs(chargedAmount - expectedAmount) > 0.01) {
      await this.prisma.payment.updateMany({
        where: { txRef },
        data: { status: 'AMOUNT_MISMATCH' },
      });
      throw new BadRequestException(
        `Payment amount mismatch. Expected ${expectedAmount}, received ${chargedAmount}.`,
      );
    }

    if (userId) {
      const existingTicket = await this.prisma.ticket.findFirst({
        where: {
          tournamentId,
          status: { in: [TicketStatus.ACTIVE, TicketStatus.USED] },
          OR: [{ purchasedBy: userId }, { fanId: userId }, { playerId: userId }],
        },
        select: { showTicketId: true },
      });
      if (existingTicket) {
        await this.prisma.payment.updateMany({
          where: { txRef },
          data: { status: 'DUPLICATE_TICKET' },
        });
        throw new ConflictException(
          `A ticket for this tournament already exists for this account.`,
        );
      }
    }

    const tierCapacity = tournament.ticketTiers
      .filter((tier) => tier.status === 'ACTIVE')
      .reduce((sum, tier) => sum + Math.max(0, tier.capacity), 0);
    const effectiveCapacity = tournament.capacity > 0 ? tournament.capacity : tierCapacity;
    const currentTotalSold = await this.prisma.ticket.count({
      where: {
        tournamentId,
        status: { in: [TicketStatus.ACTIVE, TicketStatus.USED] },
      },
    });
    if (effectiveCapacity > 0 && currentTotalSold + quantity > effectiveCapacity) {
      await this.prisma.payment.updateMany({
        where: { txRef },
        data: { status: 'CAPACITY_EXCEEDED' },
      });
      throw new BadRequestException(
        `Payment verified, but no seats remain. Remaining seats: ${Math.max(0, effectiveCapacity - currentTotalSold)}.`,
      );
    }
    if (selectedTier && selectedTier.sold + quantity > selectedTier.capacity) {
      await this.prisma.payment.updateMany({
        where: { txRef },
        data: { status: 'TIER_CAPACITY_EXCEEDED' },
      });
      throw new BadRequestException(
        `Payment verified, but the selected tier has no remaining capacity.`,
      );
    }

    const requestedSeat = null;
    const unitPrice =
      quantity > 0
        ? Number((txData.amount / quantity).toFixed(2))
        : txData.amount;

    const issuedTickets: any[] = [];

    // Perform DB issuance
    for (let i = 0; i < quantity; i++) {
      const ticketId = crypto.randomUUID();
      // Generate cryptographically unique, unguessable serial (e.g. TCK-2026-8F2A-4B9C)
      const randomChunk1 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const randomChunk2 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const showTicketId = `TCK-2026-${randomChunk1}-${randomChunk2}`;
      const seat = requestedSeat || null;

      // Cryptographic Anti-Clone Signature (HMAC-SHA256)
      const hmacSecret =
        process.env.JWT_SECRET || 'tape_ticketing_secure_salt_2026';
      const signature = crypto
        .createHmac('sha256', hmacSecret)
        .update(`${ticketId}:${tournamentId}:${userId || 'GUEST'}`)
        .digest('hex')
        .slice(0, 12)
        .toUpperCase();

      // Tamper-proof QR token format: FAN:tournamentId:userId:ticketId:SIGNATURE
      const prefix = userRole === 'PLAYER' ? 'PLAYER' : 'FAN';
      const qrToken = `${prefix}:${tournamentId}:${userId || ticketId}:${ticketId}:${signature}`;

      const ticket = await this.prisma.ticket.create({
        data: {
          ticketId,
          showTicketId,
          tournamentId,
          purchasedBy: userId || 'GUEST',
          purchaserRole: userRole,
          fanId: userRole === 'FAN' && userId ? userId : null,
          playerId: userRole === 'PLAYER' && userId ? userId : null,
          type: ticketType,
          pricePaid: unitPrice,
          currency: txData.currency || tournament.currency || 'NGN',
          status: TicketStatus.ACTIVE,
          qrToken,
          seatNumber: seat,
          paymentReference: txRef,
          flwTransactionId: String(txData.id),
          paymentGateway: 'FLUTTERWAVE',
          paymentStatus: 'SUCCESS',
          metadata: {
            tierId,
            flwRef: txData.flwRef,
            amountCharged: txData.chargedAmount || txData.amount,
          },
        },
        include: {
          tournament: {
            select: {
              tournamentId: true,
              name: true,
              startDate: true,
              currency: true,
            },
          },
          fan: {
            select: {
              fanId: true,
              firstName: true,
              surname: true,
              email: true,
              phoneNumber: true,
              gamerTag: true,
            },
          },
          player: {
            select: {
              playerId: true,
              firstName: true,
              lastName: true,
              email: true,
              phoneNumber: true,
              gamerTag: true,
            },
          },
        },
      });

      issuedTickets.push(ticket);
    }

    // Increment tier sold count if applicable (with fallback matching by ticketType)
    let targetTierId = tierId;
    if (!targetTierId && tournament.ticketTiers?.length > 0) {
      const matched = tournament.ticketTiers.find((t) => t.type === ticketType);
      if (matched) {
        targetTierId = matched.tierId;
      }
    }

    if (targetTierId) {
      await this.prisma.ticketTier
        .update({
          where: { tierId: targetTierId },
          data: {
            sold: { increment: quantity },
          },
        })
        .catch((err) => {
          this.logger.warn(`Failed to update tier sold count: ${err.message}`);
        });
    }

    const baseUrl = process.env.FRONTEND_URL || 'https://tapegaming.com';
    const rolePath = userRole === 'PLAYER' ? 'player' : 'fan';

    const formattedTickets = issuedTickets.map((t) => {
      const name = t.fan
        ? `${t.fan.firstName} ${t.fan.surname || ''}`.trim()
        : t.player
          ? `${t.player.firstName} ${t.player.lastName}`.trim()
          : 'Spectator';
      const email = t.fan?.email || t.player?.email || null;
      const phone = t.fan?.phoneNumber || t.player?.phoneNumber || null;

      return {
        ...t,
        purchaserName: name,
        purchaserEmail: email,
        purchaserPhone: phone,
        passUrl: `${baseUrl}/${rolePath}/tickets/${t.ticketId}`,
        oneTimeUseOnly: true,
        isUsable: t.status === TicketStatus.ACTIVE && !t.checkedIn,
      };
    });

    return {
      verified: true,
      message: `${quantity} ticket(s) issued successfully`,
      oneTicketOneTimeOnly: true,
      canBuyMultipleTimes: true,
      purchaserRole: userRole,
      purchaserId: userId,
      tickets: formattedTickets,
    };
  }

  /**
   * 4. Handle Flutterwave Webhook
   */
  async handleWebhook(body: any, signature?: string) {
    const isVerified = this.flutterwaveService.verifyWebhookHash(signature);

    if (!isVerified) {
      throw new UnauthorizedException('Invalid Flutterwave webhook signature');
    }

    this.logger.log(`Flutterwave ticket webhook event: ${body?.event}`);

    if (
      body?.event === 'charge.completed' &&
      body?.data?.status === 'successful'
    ) {
      const txRef = body.data.tx_ref;
      const txId = body.data.id;
      if (txRef && txRef.startsWith('FLW-TCK')) {
        await this.verifyPaymentAndIssueTicket(txRef, txId);
      }
    }

    return { received: true };
  }

  /**
   * 5. QR Code Venue Check-In (Scanner Parity)
   */
  async checkInByQr(dto: CheckInTicketDto, staffUser?: any) {
    if (!dto.qrToken) {
      throw new BadRequestException('QR token is required');
    }

    let trimmedToken = dto.qrToken.trim();
    if (trimmedToken.includes('token=') || trimmedToken.includes('code=')) {
      try {
        const urlObj = new URL(trimmedToken);
        const urlToken =
          urlObj.searchParams.get('token') || urlObj.searchParams.get('code');
        if (urlToken) trimmedToken = urlToken.trim();
      } catch {
        // Fallback to raw string if token is not a URL
      }
    }
    const now = new Date();
    const guardName =
      staffUser?.name ||
      staffUser?.fullName ||
      staffUser?.email ||
      'Security Guard';
    const guardId = staffUser?.userId || staffUser?.id || null;
    const guardRole = staffUser?.role || 'SECURITY';

    const logAndBroadcast = async (
      status: 'VALID' | 'ALREADY_CHECKED_IN' | 'INVALID',
      message: string,
      ticket?: any,
      attendeeName?: string,
    ) => {
      try {
        const scanLog = await this.prisma.ticketScanLog.create({
          data: {
            ticketId: ticket?.ticketId || null,
            showTicketId: ticket?.showTicketId || null,
            qrToken: trimmedToken,
            attendeeName: attendeeName || 'Unknown Attendee',
            passType: ticket?.type || 'UNKNOWN',
            status,
            message,
            guardId,
            guardName,
            guardRole,
          },
        });

        this.ticketScanGateway.broadcastScan({
          id: scanLog.id,
          code: scanLog.qrToken,
          ticketId: scanLog.showTicketId || scanLog.ticketId || scanLog.qrToken,
          attendeeName: scanLog.attendeeName,
          type: scanLog.passType,
          status: scanLog.status,
          message: scanLog.message,
          guardName: scanLog.guardName,
          timestamp: new Date(scanLog.createdAt).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          createdAt: scanLog.createdAt,
        });
      } catch (logErr) {
        this.logger.error('Failed to log or broadcast ticket scan', logErr);
      }
    };

    // Raffle claim QR codes share the venue scanner, but use a one-time
    // redemption path instead of being treated as ordinary admission tickets.
    if (trimmedToken.startsWith('RAFFLE:')) {
      const role = String(guardRole).toUpperCase();
      const allowedRoles = [
        'SECURITY',
        'SECURITY_GUARD',
        'EMPLOYEE',
        'MANAGER',
        'ADMIN',
        'SUPER_ADMIN',
      ];
      if (!allowedRoles.includes(role)) {
        throw new ForbiddenException(
          'Only venue security, employees, managers, and admins can verify raffle claims.',
        );
      }

      const raffleId = trimmedToken.split(':')[1];
      const redemption = await this.prisma.$transaction(async (tx) => {
        // Lock the raffle row so two scanners cannot redeem the same winner
        // concurrently while the winner list is stored as JSON.
        await tx.$queryRaw`SELECT "raffleId" FROM "Raffle" WHERE "raffleId" = ${raffleId} FOR UPDATE`;
        const raffle = await tx.raffle.findUnique({
          where: { raffleId },
          include: { tournament: { select: { tournamentId: true, name: true } } },
        });
        if (!raffle) return { kind: 'INVALID' as const };

        const winners = Array.isArray(raffle.winners)
          ? (raffle.winners as any[])
          : [];
        const winnerIndex = winners.findIndex(
          (winner) => winner?.qrCodeString === trimmedToken,
        );
        if (winnerIndex < 0) return { kind: 'INVALID' as const };

        const winner = winners[winnerIndex];
        const scanTicket = {
          ticketId: raffle.raffleId,
          showTicketId: winner.ticketNumber || raffle.raffleId,
          type: 'RAFFLE_PRIZE_CLAIM',
        };
        if (winner.redeemed || winner.claimedAt || winner.redeemedAt) {
          return {
            kind: 'ALREADY_CLAIMED' as const,
            raffle,
            winner,
            scanTicket,
          };
        }

        const redeemedAt = new Date();
        const updatedWinners = [...winners];
        updatedWinners[winnerIndex] = {
          ...winner,
          redeemed: true,
          redeemedAt: redeemedAt.toISOString(),
          redeemedBy: guardId,
          redeemedByName: guardName,
          redeemedByRole: role,
          redemptionVenueId: dto.venueId || null,
          redemptionScreenId: dto.screenId || null,
        };
        await tx.raffle.update({
          where: { raffleId },
          data: { winners: updatedWinners as any },
        });

        return {
          kind: 'VALID' as const,
          raffle,
          winner: updatedWinners[winnerIndex],
          scanTicket,
          redeemedAt,
        };
      });

      if (redemption.kind === 'INVALID') {
        const message = 'Invalid raffle claim QR. No matching winner was found.';
        await logAndBroadcast('INVALID', message);
        throw new NotFoundException(message);
      }
      if (redemption.kind === 'ALREADY_CLAIMED') {
        const message = 'This raffle prize has already been claimed.';
        await logAndBroadcast(
          'ALREADY_CHECKED_IN',
          message,
          redemption.scanTicket,
          redemption.winner?.name,
        );
        throw new ConflictException(message);
      }

      const winnerName = redemption.winner?.name || 'Raffle winner';
      const message = `Raffle prize claim verified for ${redemption.raffle.name}.`;
      const ticket = {
        ...redemption.scanTicket,
        purchaserName: winnerName,
        attendeeName: winnerName,
        tournamentName: redemption.raffle.tournament.name,
        seatNumber: redemption.raffle.prizeDescription,
        totalScanCount: 1,
      };
      await logAndBroadcast('VALID', message, ticket, winnerName);
      return {
        success: true,
        raffleRedemption: true,
        message,
        raffle: {
          raffleId: redemption.raffle.raffleId,
          name: redemption.raffle.name,
          prizeDescription: redemption.raffle.prizeDescription,
          tournamentName: redemption.raffle.tournament.name,
        },
        ticket,
        checkedInAt: redemption.redeemedAt,
      };
    }

    // Look up ticket by exact qrToken, ticketId, showTicketId, or parsed token
    let ticket = await this.prisma.ticket.findFirst({
      where: {
        OR: [
          { qrToken: trimmedToken },
          { ticketId: trimmedToken },
          { showTicketId: trimmedToken },
        ],
      },
      include: {
        tournament: true,
        fan: true,
        player: true,
      },
    });

    if (!ticket) {
      // Try parsing if format is e.g. PREFIX:tournamentId:userId:ticketId
      const parts = trimmedToken.split(':');
      if (parts.length >= 4) {
        const potentialTicketId = parts[3];
        ticket = await this.prisma.ticket.findFirst({
          where: {
            OR: [{ ticketId: potentialTicketId }, { qrToken: trimmedToken }],
          },
          include: {
            tournament: true,
            fan: true,
            player: true,
          },
        });
      }
    }

    if (!ticket) {
      // Check if this token belongs to a Competitor TournamentRegistration
      const reg = await this.prisma.tournamentRegistration.findFirst({
        where: {
          OR: [
            { qrCodeString: trimmedToken },
            { registrationId: trimmedToken },
          ],
        },
        include: {
          tournament: true,
          player: true,
        },
      });

      if (reg) {
        const attendeeName = reg.player
          ? `${reg.player.firstName} ${reg.player.lastName} (${reg.player.gamerTag || 'Player'})`.trim()
          : 'Player Competitor';

        if (reg.checkedInVenue) {
          const errMsg = `Competitor pass for "${reg.player?.gamerTag || 'Player'}" was already scanned and checked in. Duplicate entry denied.`;
          await logAndBroadcast(
            'ALREADY_CHECKED_IN',
            errMsg,
            undefined,
            attendeeName,
          );
          throw new BadRequestException(errMsg);
        }

        await this.prisma.tournamentRegistration.update({
          where: { registrationId: reg.registrationId },
          data: { checkedInVenue: true },
        });

        // Ensure active ticket is upserted for reporting parity
        ticket = await this.prisma.ticket.upsert({
          where: { qrToken: reg.qrCodeString || trimmedToken },
          update: { checkedIn: true, checkedInAt: now },
          create: {
            tournamentId: reg.tournamentId,
            playerId: reg.playerId,
            purchasedBy: reg.playerId,
            purchaserRole: 'PLAYER',
            type: TicketType.DAY_PASS,
            pricePaid: reg.tournament?.entryFee || 0,
            currency: reg.tournament?.currency || 'NGN',
            status: TicketStatus.USED,
            qrToken: reg.qrCodeString || trimmedToken,
            checkedIn: true,
            checkedInAt: now,
            showTicketId: `PASS-${reg.registrationId.slice(0, 8).toUpperCase()}`,
          },
          include: {
            tournament: true,
            fan: true,
            player: true,
          },
        });

        await logAndBroadcast(
          'VALID',
          `Competitor Pass verified for ${reg.tournament.name}`,
          ticket,
          attendeeName,
        );

        return {
          ticket: {
            ...ticket,
            ticketId: reg.registrationId,
            showTicketId: `COMP-${reg.registrationId.slice(0, 8).toUpperCase()}`,
            type: 'COMPETITOR_PASS',
            status: 'ACTIVE',
            checkedIn: true,
            tournamentName: reg.tournament.name,
            attendeeName,
            purchaserName: attendeeName,
            seatNumber: 'Main Stage Competitor',
          },
          tournament: reg.tournament,
          checkedInAt: now,
          message: 'Competitor Pass verified and checked in successfully',
        };
      }

      // Check if this token belongs to an Employee (Security Guard, Manager, Event Staff)
      let employeeLookupId = trimmedToken;
      if (trimmedToken.startsWith('STAFF:')) {
        const parts = trimmedToken.split(':');
        employeeLookupId = parts.length >= 3 ? parts[2] : parts[1];
      }

      const employee = await this.prisma.employee.findFirst({
        where: {
          OR: [
            { employeeId: employeeLookupId },
            { showEmployeeId: employeeLookupId },
            { employeeId: trimmedToken },
            { showEmployeeId: trimmedToken },
            { email: trimmedToken },
            { qrCode: { has: trimmedToken } },
          ],
          isDeleted: false,
        },
      });

      if (employee) {
        if (employee.state !== 'ACTIVE') {
          const errMsg = `Staff credential for ${employee.name} (${employee.role}) is ${employee.state}. Access Denied.`;
          await logAndBroadcast('INVALID', errMsg, undefined, employee.name);
          throw new BadRequestException(errMsg);
        }

        const attendeeName = `${employee.name} (${employee.role.replace('_', ' ')})`;
        const passTitle =
          employee.role === 'SECURITY'
            ? 'Official Security Guard Pass'
            : employee.role === 'MANAGER'
              ? 'Official Venue Manager Pass'
              : 'Official Staff Access Pass';

        const successMessage = `Access Granted: ${passTitle}`;
        await logAndBroadcast('VALID', successMessage, undefined, attendeeName);

        return {
          success: true,
          message: successMessage,
          ticket: {
            ticketId: employee.employeeId,
            showTicketId:
              employee.showEmployeeId ||
              `STAFF-${employee.employeeId.slice(0, 8).toUpperCase()}`,
            purchaserName: employee.name,
            attendeeName,
            purchaserRole: employee.role,
            type: `${employee.role}_PASS`,
            seatNumber: 'All-Access Staff • Security Clearance',
            checkedInAt: now,
            lastScannedAt: now,
            totalScanCount: 1,
            tournamentName: 'Tape Arena Venue Operations',
          },
        };
      }

      const errMsg = 'Invalid Ticket QR code. Ticket not found.';
      await logAndBroadcast('INVALID', errMsg);
      throw new NotFoundException(errMsg);
    }

    // Resolve attendee name
    const attendeeName = ticket.fan
      ? `${ticket.fan.firstName} ${ticket.fan.surname || ''}`.trim()
      : ticket.player
        ? `${ticket.player.firstName} ${ticket.player.lastName}`.trim()
        : 'Spectator';

    // Validate tournament matching if tournamentId is specified
    if (dto.tournamentId && ticket.tournamentId !== dto.tournamentId) {
      const errMsg = `Wrong Tournament: Ticket belongs to "${ticket.tournament.name}", not the current venue tournament.`;
      await logAndBroadcast('INVALID', errMsg, ticket, attendeeName);
      throw new BadRequestException(errMsg);
    }

    if (ticket.status === TicketStatus.CANCELLED) {
      const errMsg = 'This ticket has been cancelled.';
      await logAndBroadcast('INVALID', errMsg, ticket, attendeeName);
      throw new BadRequestException(errMsg);
    }
    if (ticket.status === TicketStatus.TRANSFERRED) {
      const errMsg = 'This ticket was transferred and its QR code is no longer valid.';
      await logAndBroadcast('INVALID', errMsg, ticket, attendeeName);
      throw new BadRequestException(errMsg);
    }

    let newStatus = ticket.status;

    // 1. DAY_PASS: Single-use ever
    if (ticket.type === TicketType.DAY_PASS) {
      if (ticket.checkedIn || ticket.status === TicketStatus.USED) {
        const usedTime = ticket.checkedInAt
          ? new Date(ticket.checkedInAt).toLocaleString('en-US', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
          : 'earlier';
        const errMsg = `This Day Pass has already been used on ${usedTime}. Duplicate entry denied.`;
        await logAndBroadcast(
          'ALREADY_CHECKED_IN',
          errMsg,
          ticket,
          attendeeName,
        );
        throw new BadRequestException(errMsg);
      }
      newStatus = TicketStatus.USED;
    }
    // 2. SEASON_PASS: Usable once per calendar day (automatically valid again tomorrow)
    else if (ticket.type === TicketType.SEASON_PASS) {
      if (ticket.lastScannedAt) {
        const lastScan = new Date(ticket.lastScannedAt);
        const isSameDay =
          lastScan.getFullYear() === now.getFullYear() &&
          lastScan.getMonth() === now.getMonth() &&
          lastScan.getDate() === now.getDate();

        if (isSameDay) {
          const timeStr = lastScan.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          });
          const errMsg = `This Season Pass was already used today at ${timeStr}. Valid again tomorrow!`;
          await logAndBroadcast(
            'ALREADY_CHECKED_IN',
            errMsg,
            ticket,
            attendeeName,
          );
          throw new BadRequestException(errMsg);
        }
      }
      // Stays active for subsequent days
      newStatus = TicketStatus.ACTIVE;
    }
    // 3. VIP: Multi-entry permitted with a 15-minute anti-passback cooldown
    else if (ticket.type === TicketType.VIP) {
      if (ticket.lastScannedAt) {
        const lastScanTime = new Date(ticket.lastScannedAt).getTime();
        const diffMs = now.getTime() - lastScanTime;
        const cooldownMs = 15 * 60 * 1000; // 15 minutes anti-passback cooldown

        if (diffMs < cooldownMs) {
          const remainingMinutes = Math.ceil(
            (cooldownMs - diffMs) / (60 * 1000),
          );
          const elapsedMinutes = Math.floor(diffMs / (60 * 1000));
          const errMsg = `Anti-passback Cooldown Active: VIP pass was scanned ${
            elapsedMinutes === 0
              ? 'less than a minute ago'
              : `${elapsedMinutes}m ago`
          }. Please wait ${remainingMinutes} more minute(s) before re-entering.`;
          await logAndBroadcast(
            'ALREADY_CHECKED_IN',
            errMsg,
            ticket,
            attendeeName,
          );
          throw new BadRequestException(errMsg);
        }
      }
      newStatus = TicketStatus.ACTIVE;
    }

    // Perform check-in update
    const updatedTicket = await this.prisma.ticket.update({
      where: { ticketId: ticket.ticketId },
      data: {
        checkedIn: true,
        checkedInAt: ticket.checkedInAt || now,
        lastScannedAt: now,
        totalScanCount: (ticket.totalScanCount || 0) + 1,
        checkedInBy: staffUser?.userId || staffUser?.id || 'STAFF',
        checkedInVenue: dto.venueId || null,
        screenId: dto.screenId || null,
        status: newStatus,
      },
      include: {
        tournament: true,
        fan: true,
        player: true,
      },
    });

    const readableType =
      updatedTicket.type === TicketType.DAY_PASS
        ? 'Day Pass'
        : updatedTicket.type === TicketType.SEASON_PASS
          ? 'Season Pass'
          : 'VIP Pass';

    const successMessage = `Access Granted: ${readableType}`;
    await logAndBroadcast('VALID', successMessage, updatedTicket, attendeeName);

    return {
      success: true,
      message: successMessage,
      ticket: {
        ticketId: updatedTicket.ticketId,
        showTicketId: updatedTicket.showTicketId,
        purchaserName: attendeeName,
        purchaserRole: updatedTicket.purchaserRole,
        type: updatedTicket.type,
        seatNumber: updatedTicket.seatNumber,
        checkedInAt: updatedTicket.checkedInAt,
        lastScannedAt: updatedTicket.lastScannedAt,
        totalScanCount: updatedTicket.totalScanCount,
        tournamentName: updatedTicket.tournament.name,
      },
    };
  }

  /**
   * 6. Get Recent Scan Logs across all security guards (for real-time dashboard)
   */
  async getRecentScans(limit: number = 30) {
    const logs = await this.prisma.ticketScanLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });

    return logs.map((log) => ({
      id: log.id,
      ticketId: log.showTicketId || log.ticketId || log.qrToken,
      code: log.qrToken,
      attendeeName: log.attendeeName || 'Unknown Attendee',
      type: log.passType || 'DAY_PASS',
      status: log.status,
      message: log.message,
      guardName: log.guardName || 'Security Guard',
      timestamp: new Date(log.createdAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      createdAt: log.createdAt,
    }));
  }

  /**
   * 6. Get Current User's Tickets
   */
  async getMyTickets(userId: string) {
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const tickets = await this.prisma.ticket.findMany({
      where: {
        OR: [{ purchasedBy: userId }, { fanId: userId }, { playerId: userId }],
      },
      include: {
        tournament: {
          select: {
            tournamentId: true,
            name: true,
            gameTitle: true,
            startDate: true,
            deadline: true,
            dailyStart: true,
            dailyEnd: true,
            tournamentLogoUrl: true,
            canvasImage: true,
            currency: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const baseUrl = process.env.FRONTEND_URL || 'https://tapegaming.com';
    const totalPasses = tickets.length;
    const activeCodes = tickets.filter(
      (t) => t.status === TicketStatus.ACTIVE && !t.checkedIn,
    ).length;
    const usedCodes = tickets.filter(
      (t) => t.checkedIn || t.status === TicketStatus.USED,
    ).length;

    const mappedTickets = tickets.map((t) => {
      const rolePath = t.purchaserRole === 'PLAYER' ? 'player' : 'fan';
      return {
        id: t.ticketId,
        showTicketId: t.showTicketId,
        tournamentId: t.tournamentId,
        tournamentName: t.tournament?.name,
        tournamentLogo: t.tournament?.tournamentLogoUrl,
        canvasImage: t.tournament?.canvasImage,
        startDate: t.tournament?.startDate,
        purchaserRole: t.purchaserRole,
        type: t.type,
        pricePaid: t.pricePaid,
        currency: t.currency,
        seatNumber: t.seatNumber,
        status: t.status,
        checkedIn: t.checkedIn,
        qrToken: t.qrToken,
        passUrl: `${baseUrl}/${rolePath}/tickets/${t.ticketId}`,
        oneTimeUseOnly: true,
        isUsable: t.status === TicketStatus.ACTIVE && !t.checkedIn,
        purchaseDate: t.createdAt,
      };
    });

    return {
      totalPasses,
      activeCodes,
      usedCodes,
      tickets: mappedTickets,
    };
  }

  /**
   * 7. Get Ticket by ID
   */
  async getTicketById(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { ticketId },
      include: {
        tournament: true,
        fan: true,
        player: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket #${ticketId} not found`);
    }

    const purchaserName = ticket.fan
      ? `${ticket.fan.firstName} ${ticket.fan.surname || ''}`.trim()
      : ticket.player
        ? `${ticket.player.firstName} ${ticket.player.lastName}`.trim()
        : 'Spectator';
    const purchaserEmail = ticket.fan?.email || ticket.player?.email || null;
    const purchaserPhone =
      ticket.fan?.phoneNumber || ticket.player?.phoneNumber || null;

    return {
      id: ticket.ticketId,
      showTicketId: ticket.showTicketId,
      tournamentId: ticket.tournamentId,
      tournamentName: ticket.tournament.name,
      tournamentStartDate: ticket.tournament.startDate,
      tournamentEndDate: ticket.tournament.deadline,
      purchaserName,
      purchaserEmail,
      purchaserPhone,
      purchaserRole: ticket.purchaserRole,
      type: ticket.type,
      seatNumber: ticket.seatNumber,
      pricePaid: ticket.pricePaid,
      currency: ticket.currency,
      status: ticket.status,
      checkedIn: ticket.checkedIn,
      checkedInAt: ticket.checkedInAt,
      qrToken: ticket.qrToken,
      passUrl: `${process.env.FRONTEND_URL || 'https://tapegaming.com'}/${ticket.purchaserRole === 'PLAYER' ? 'player' : 'fan'}/tickets/${ticket.ticketId}`,
      oneTimeUseOnly: true,
      isUsable: ticket.status === TicketStatus.ACTIVE && !ticket.checkedIn,
      paymentReference: ticket.paymentReference,
      createdAt: ticket.createdAt,
    };
  }

  /**
   * 8. Global Ticket Sales & Analytics (TicketSalesAnalytics.tsx Parity)
   */
  async getGlobalAnalytics() {
    const allTickets = await this.prisma.ticket.findMany({
      where: {
        status: { in: [TicketStatus.ACTIVE, TicketStatus.USED] },
      },
      include: {
        tournament: {
          select: {
            tournamentId: true,
            name: true,
            currency: true,
          },
        },
        fan: {
          select: {
            firstName: true,
            surname: true,
          },
        },
        player: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalTicketsSold = allTickets.length;
    const totalRevenue = allTickets.reduce(
      (sum, t) => sum + (t.pricePaid || 0),
      0,
    );
    const totalCheckIns = allTickets.filter((t) => t.checkedIn).length;
    const checkInRate =
      totalTicketsSold > 0
        ? Number(((totalCheckIns / totalTicketsSold) * 100).toFixed(1))
        : 0;

    // Aggregate sales by tournament
    const tournamentMap = new Map<
      string,
      { name: string; revenue: number; tickets: number }
    >();

    for (const t of allTickets) {
      const tourId = t.tournamentId;
      const tourName = t.tournament?.name || 'Tournament';
      const existing = tournamentMap.get(tourId) || {
        name: tourName,
        revenue: 0,
        tickets: 0,
      };
      existing.revenue += t.pricePaid || 0;
      existing.tickets += 1;
      tournamentMap.set(tourId, existing);
    }

    const salesByTournament = Array.from(tournamentMap.values());

    // Recent ticket purchases (up to 15)
    const recentPurchases = allTickets.slice(0, 15).map((t) => {
      const name = t.fan
        ? `${t.fan.firstName} ${t.fan.surname || ''}`.trim()
        : t.player
          ? `${t.player.firstName} ${t.player.lastName}`.trim()
          : 'Anonymous Fan';
      return {
        id: t.ticketId,
        showTicketId: t.showTicketId,
        fanName: name,
        type: t.type,
        pricePaid: t.pricePaid,
        currency: t.currency,
        tournamentName: t.tournament?.name || 'Tournament',
        createdAt: t.createdAt,
      };
    });

    return {
      totalRevenue,
      totalTicketsSold,
      totalCheckIns,
      checkInRate,
      salesByTournament,
      recentPurchases,
    };
  }

  /**
   * 9. Filter / List all tickets with pagination
   */
  async getAllTickets(query: QueryTicketDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.tournamentId) {
      where.tournamentId = query.tournamentId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.searchTerm) {
      where.OR = [
        { showTicketId: { contains: query.searchTerm, mode: 'insensitive' } },
        { qrToken: { contains: query.searchTerm, mode: 'insensitive' } },
        { seatNumber: { contains: query.searchTerm, mode: 'insensitive' } },
        {
          fan: {
            firstName: { contains: query.searchTerm, mode: 'insensitive' },
          },
        },
        { fan: { email: { contains: query.searchTerm, mode: 'insensitive' } } },
        {
          player: {
            firstName: { contains: query.searchTerm, mode: 'insensitive' },
          },
        },
        {
          player: {
            email: { contains: query.searchTerm, mode: 'insensitive' },
          },
        },
      ];
    }

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          tournament: {
            select: {
              tournamentId: true,
              name: true,
              currency: true,
            },
          },
          fan: {
            select: {
              fanId: true,
              firstName: true,
              surname: true,
              email: true,
              phoneNumber: true,
              gamerTag: true,
            },
          },
          player: {
            select: {
              playerId: true,
              firstName: true,
              lastName: true,
              email: true,
              phoneNumber: true,
              gamerTag: true,
            },
          },
        },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    const mappedTickets = tickets.map((t) => {
      const name = t.fan
        ? `${t.fan.firstName} ${t.fan.surname || ''}`.trim()
        : t.player
          ? `${t.player.firstName} ${t.player.lastName}`.trim()
          : 'Spectator';
      return {
        ...t,
        purchaserName: name,
        purchaserEmail: t.fan?.email || t.player?.email || null,
        purchaserPhone: t.fan?.phoneNumber || t.player?.phoneNumber || null,
      };
    });

    return {
      data: mappedTickets,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Transfer Ticket Pass to another Fan/Player by Phone or Email
   * "License transfers are irrecoverable and immediately lock ticket access once completed."
   */
  async transferTicket(
    currentUser: { userId: string; role?: string },
    dto: TransferTicketDto,
  ) {
    if (!currentUser?.userId) {
      throw new UnauthorizedException(
        'Authentication required to transfer ticket',
      );
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { ticketId: dto.ticketId },
      include: {
        tournament: true,
        fan: true,
        player: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket #${dto.ticketId} not found`);
    }

    // Ownership check (or admin)
    const isAdmin =
      currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN';
    const isOwner =
      ticket.purchasedBy === currentUser.userId ||
      ticket.fanId === currentUser.userId ||
      ticket.playerId === currentUser.userId;

    if (!isOwner && !isAdmin) {
      throw new BadRequestException(
        'You do not have permission to transfer this ticket.',
      );
    }

    // Usability checks
    if (ticket.checkedIn || ticket.status === TicketStatus.USED) {
      throw new BadRequestException('Used tickets cannot be transferred.');
    }
    if (ticket.status === TicketStatus.TRANSFERRED) {
      throw new BadRequestException(
        'This ticket has already been transferred.',
      );
    }
    if (ticket.status === TicketStatus.CANCELLED) {
      throw new BadRequestException('Cancelled tickets cannot be transferred.');
    }

    const normalizePhone = (value?: string | null) =>
      String(value || '').replace(/\D/g, '');
    const cleanPhone = normalizePhone(dto.recipientPhone);
    if (cleanPhone.length < 7) {
      throw new BadRequestException('Enter a valid recipient phone number.');
    }

    // Search by a short suffix first, then compare normalized full numbers so
    // formatting differences do not accidentally select a different account.
    const phoneSuffix = cleanPhone.slice(-4);
    const [fanCandidates, playerCandidates] = await Promise.all([
      this.prisma.fan.findMany({
        where: {
          isDeleted: false,
          OR: [
            { phoneNumber: { contains: phoneSuffix } },
            ...(dto.recipientEmail
              ? [{ email: { equals: dto.recipientEmail.trim(), mode: 'insensitive' as const } }]
              : []),
          ],
        },
        take: 500,
      }),
      this.prisma.player.findMany({
        where: {
          isDeleted: false,
          OR: [
            { phoneNumber: { contains: phoneSuffix } },
            ...(dto.recipientEmail
              ? [{ email: { equals: dto.recipientEmail.trim(), mode: 'insensitive' as const } }]
              : []),
          ],
        },
        take: 500,
      }),
    ]);
    const recipientMatches = [
      ...fanCandidates
        .filter((candidate) => normalizePhone(candidate.phoneNumber) === cleanPhone)
        .map((fan) => ({ role: 'FAN' as const, id: fan.fanId, fan, player: null })),
      ...playerCandidates
        .filter((candidate) => normalizePhone(candidate.phoneNumber) === cleanPhone)
        .map((player) => ({ role: 'PLAYER' as const, id: player.playerId, fan: null, player })),
    ];
    if (recipientMatches.length !== 1) {
      throw new BadRequestException(
        recipientMatches.length > 1
          ? 'This phone number matches more than one account. Ask the recipient to use a unique phone number or contact support.'
          : 'The recipient must have an active Fan or Player account with this phone number before you can transfer the ticket.',
      );
    }

    const { role: recipientRole, id: recipientId, fan: recipientFan, player: recipientPlayer } = recipientMatches[0];
    if (recipientId === currentUser.userId) {
      throw new BadRequestException('You cannot transfer a ticket to yourself.');
    }
    const recipientName = recipientFan
      ? `${recipientFan.firstName} ${recipientFan.surname || ''}`.trim()
      : recipientPlayer
        ? `${recipientPlayer.firstName} ${recipientPlayer.lastName}`.trim()
        : dto.recipientPhone;

    const newShowTicketId = `TCK-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const newQrToken = `${recipientRole}:${ticket.tournamentId}:${recipientId}:${crypto.randomUUID()}`;

    const transferredAt = new Date();
    const oldMetadata =
      typeof ticket.metadata === 'object' && ticket.metadata
        ? (ticket.metadata as Record<string, any>)
        : {};
    const transferHistory = Array.isArray(oldMetadata.transferHistory)
      ? oldMetadata.transferHistory
      : [];
    const transferEvent = {
      fromUserId: currentUser.userId,
      toUserId: recipientId,
      toPhone: dto.recipientPhone,
      toName: recipientName,
      transferredAt: transferredAt.toISOString(),
    };
    const lineageMetadata = {
      ...oldMetadata,
      transferCount: Number(oldMetadata.transferCount || 0) + 1,
      transferHistory: [...transferHistory, transferEvent],
    };

    // Conditional update makes the sender's pass single-use even if two
    // transfer requests arrive at nearly the same time. The new wallet pass
    // is created in the same transaction, so either both changes persist or
    // neither does. The recipient can later transfer this new active pass.
    const newIssuedTicket = await this.prisma.$transaction(async (tx) => {
      const latestTicket = await tx.ticket.findUnique({
        where: { ticketId: ticket.ticketId },
        select: { status: true, checkedIn: true },
      });
      if (!latestTicket || latestTicket.status !== TicketStatus.ACTIVE || latestTicket.checkedIn) {
        throw new ConflictException('This ticket is no longer available to transfer.');
      }

      const recipientHasPass = await tx.ticket.findFirst({
        where: {
          tournamentId: ticket.tournamentId,
          status: { in: [TicketStatus.ACTIVE, TicketStatus.USED] },
          OR: [
            { purchasedBy: recipientId },
            ...(recipientFan ? [{ fanId: recipientFan.fanId }] : []),
            ...(recipientPlayer ? [{ playerId: recipientPlayer.playerId }] : []),
          ],
        },
        select: { showTicketId: true },
      });
      if (recipientHasPass) {
        throw new ConflictException('The recipient already has a ticket for this tournament.');
      }

      const locked = await tx.ticket.updateMany({
        where: {
          ticketId: ticket.ticketId,
          status: TicketStatus.ACTIVE,
          checkedIn: false,
        },
        data: {
          status: TicketStatus.TRANSFERRED,
          metadata: {
            ...lineageMetadata,
            ...transferEvent,
            transferredToUserId: recipientId,
          } as any,
        },
      });
      if (locked.count !== 1) {
        throw new ConflictException('This ticket was already transferred. Refresh your wallet.');
      }

      return tx.ticket.create({
        data: {
          showTicketId: newShowTicketId,
          tournamentId: ticket.tournamentId,
          type: ticket.type,
          pricePaid: ticket.pricePaid,
          currency: ticket.currency,
          seatNumber: ticket.seatNumber,
          status: TicketStatus.ACTIVE,
          checkedIn: false,
          qrToken: newQrToken,
          purchasedBy: recipientId,
          purchaserRole: recipientRole,
          fanId: recipientFan?.fanId || null,
          playerId: recipientPlayer?.playerId || null,
          paymentReference: `TRANSFER-${ticket.ticketId.slice(0, 8)}-${Date.now()}`,
          metadata: {
            ...lineageMetadata,
            transferredFromTicketId: ticket.ticketId,
            transferredFromShowTicketId: ticket.showTicketId,
            transferredFromUserId: currentUser.userId,
            originalPurchaseDate: ticket.createdAt.toISOString(),
          } as any,
        },
        include: {
          tournament: {
            select: {
              tournamentId: true,
              name: true,
              tournamentLogoUrl: true,
            },
          },
        },
      });
    });

    return {
      message: `Ticket successfully transferred to recipient (${recipientName || dto.recipientPhone}). Your ticket access has been locked.`,
      originalTicketId: ticket.ticketId,
      originalTicketStatus: TicketStatus.TRANSFERRED,
      recipientTicketId: newIssuedTicket.ticketId,
      recipientShowTicketId: newIssuedTicket.showTicketId,
      recipientName,
      recipientPhone: dto.recipientPhone,
      transferCount: lineageMetadata.transferCount,
      tournamentName: ticket.tournament?.name,
      seatNumber: ticket.seatNumber,
    };
  }

  /**
   * 10. Ticket Tier CRUD
   */
  async createTier(dto: CreateTierDto) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId: dto.tournamentId },
    });

    if (!tournament) {
      throw new NotFoundException(`Tournament #${dto.tournamentId} not found`);
    }

    return this.prisma.ticketTier.create({
      data: {
        tournamentId: dto.tournamentId,
        name: dto.name,
        type: dto.type || TicketType.DAY_PASS,
        price: dto.price,
        currency: dto.currency || tournament.currency || 'NGN',
        capacity: dto.capacity || 100,
        description: dto.description || null,
        status: 'ACTIVE',
      },
    });
  }

  async getTiersByTournament(tournamentId: string) {
    const tiers = await this.prisma.ticketTier.findMany({
      where: { tournamentId },
      orderBy: { price: 'asc' },
    });
    return tiers.map((tier) => ({
      ...tier,
      soldCount: tier.sold,
      remainingSeats: Math.max(0, tier.capacity - tier.sold),
    }));
  }

  async updateTier(tierId: string, dto: UpdateTierDto) {
    const tier = await this.prisma.ticketTier.findUnique({
      where: { tierId },
    });

    if (!tier) {
      throw new NotFoundException(`Ticket Tier #${tierId} not found`);
    }

    return this.prisma.ticketTier.update({
      where: { tierId },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.currency ? { currency: dto.currency } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
  }

  async deleteTier(tierId: string) {
    const tier = await this.prisma.ticketTier.findUnique({
      where: { tierId },
    });

    if (!tier) {
      throw new NotFoundException(`Ticket Tier #${tierId} not found`);
    }

    if (tier.sold > 0) {
      throw new BadRequestException(
        'Cannot delete ticket tier that has sold tickets. Deactivate or set status to HIDDEN instead.',
      );
    }

    await this.prisma.ticketTier.delete({
      where: { tierId },
    });

    return { message: 'Ticket tier deleted successfully' };
  }

  async getAllTiers(tournamentId?: string) {
    const where: any = {};
    if (tournamentId) {
      where.tournamentId = tournamentId;
    }
    return this.prisma.ticketTier.findMany({
      where,
      include: {
        tournament: {
          select: {
            tournamentId: true,
            name: true,
            currency: true,
          },
        },
      },
      orderBy: [{ tournamentId: 'asc' }, { price: 'asc' }],
    });
  }

  async purchaseDirect(body: {
    tournamentId: string;
    tierId?: string;
    type?: TicketType;
    fanId?: string;
    playerId?: string;
    purchasedBy?: string;
    purchaserRole?: string;
    pricePaid?: number;
    seatNumber?: string;
  }) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { tournamentId: body.tournamentId },
      include: { ticketTiers: true },
    });

    if (!tournament) {
      throw new NotFoundException(`Tournament #${body.tournamentId} not found`);
    }

    let tier: any = null;
    if (body.tierId) {
      tier = tournament.ticketTiers.find((t) => t.tierId === body.tierId);
    } else if (tournament.ticketTiers.length > 0) {
      tier = tournament.ticketTiers[0];
    }

    const price =
      body.pricePaid !== undefined
        ? body.pricePaid
        : (tier?.price ?? tournament.entryFee ?? 0);
    const type = body.type || tier?.type || TicketType.DAY_PASS;
    const ticketId = crypto.randomUUID();
    const count = await this.prisma.ticket.count({
      where: { tournamentId: body.tournamentId },
    });
    const randomChunk1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const randomChunk2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const showTicketId = `TCK-2026-${randomChunk1}-${randomChunk2}`;
    const purchaserRole = (
      body.purchaserRole || (body.playerId ? 'PLAYER' : 'FAN')
    ).toUpperCase();
    const userId =
      body.purchasedBy || body.fanId || body.playerId || `user-${Date.now()}`;

    if (body.fanId || body.playerId || body.purchasedBy) {
      const ownerFilters: Array<Record<string, string>> = [
        { purchasedBy: userId },
      ];
      if (body.fanId) ownerFilters.push({ fanId: body.fanId });
      if (body.playerId) ownerFilters.push({ playerId: body.playerId });

      const existingTicket = await this.prisma.ticket.findFirst({
        where: {
          tournamentId: body.tournamentId,
          status: { in: [TicketStatus.ACTIVE, TicketStatus.USED] },
          OR: ownerFilters,
        },
        select: { showTicketId: true },
      });
      if (existingTicket) {
        throw new ConflictException(
          `You already have a ticket for "${tournament.name}". One ticket per fan is allowed.`,
        );
      }
    }

    const hmacSecret =
      process.env.JWT_SECRET || 'tape_ticketing_secure_salt_2026';
    const signature = crypto
      .createHmac('sha256', hmacSecret)
      .update(`${ticketId}:${body.tournamentId}:${userId}`)
      .digest('hex')
      .slice(0, 12)
      .toUpperCase();
    const qrToken = `${purchaserRole}:${body.tournamentId}:${userId}:${ticketId}:${signature}`;

    const [ticket] = await this.prisma.$transaction([
      this.prisma.ticket.create({
        data: {
          ticketId,
          showTicketId,
          tournamentId: body.tournamentId,
          purchasedBy: userId,
          purchaserRole,
          fanId: body.fanId || (purchaserRole === 'FAN' ? userId : null),
          playerId:
            body.playerId || (purchaserRole === 'PLAYER' ? userId : null),
          type,
          pricePaid: price,
          currency: tier?.currency || tournament.currency || 'NGN',
          status: TicketStatus.ACTIVE,
          qrToken,
          seatNumber: body.seatNumber || null,
          paymentReference: `DIRECT-${Date.now().toString(36).toUpperCase()}`,
          paymentGateway: 'DIRECT',
          paymentStatus: 'SUCCESS',
          metadata: {
            tierId: tier?.tierId,
            tierName: tier?.name,
          },
        },
        include: {
          tournament: {
            select: {
              tournamentId: true,
              name: true,
              startDate: true,
              currency: true,
            },
          },
          fan: {
            select: {
              fanId: true,
              firstName: true,
              surname: true,
              email: true,
            },
          },
          player: {
            select: {
              playerId: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      ...(tier
        ? [
            this.prisma.ticketTier.update({
              where: { tierId: tier.tierId },
              data: { sold: { increment: 1 } },
            }),
          ]
        : []),
    ]);

    return ticket;
  }
}
