import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request } from 'express';
import { PlayerPassService } from '../service/player-pass.service';
import { PlayerWalletService } from '../service/player-wallet.service';
import { RequestPayoutDto } from '../dto/request-payout.dto';
import { sendResponse } from '../../utils/response.util';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email: string;
    role: string;
  };
}

@ApiTags('player/wallet')
@ApiBearerAuth()
@Controller('player/wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PLAYER, 'player', Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
export class PlayerWalletController {
  constructor(
    private readonly playerPassService: PlayerPassService,
    private readonly playerWalletService: PlayerWalletService,
  ) {}

  /**
   * 1. Tab 1: 🎟️ SECURE PASS & ID
   * Retrieves all active tournament passes and licenses for the logged-in competitor.
   */
  @Get('passes')
  @ApiOperation({
    summary: 'Get all Active Tournament Passes & Competitor Licenses for logged-in Player (with pagination)',
    description:
      'Populates the "TOURNAMENT PASSES & IDS" screen in the Player Wallet with formatted tournament name, format, status, and QR tokens.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Passes retrieved successfully' })
  async getMyPasses(
    @Req() req: RequestWithUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const playerId = req.user.userId;
    const data = await this.playerPassService.getMyPasses(playerId, { page, limit });
    return sendResponse({
      message: 'Competitor passes retrieved successfully',
      data,
      meta: (data as any)?.meta || (data as any)?.pagination,
    });
  }

  /**
   * 2. Modal: COMPETITOR SECURE CARD
   * Retrieves the dynamic license card for a specific tournament.
   */
  @Get('passes/:tournamentId')
  @ApiOperation({
    summary: 'Get Personal Pass License & Competitor Card for a specific tournament',
    description:
      'Powers the "VIEW CARD" action and Competitor Secure Card modal with official logos, team selections, and gate QR code.',
  })
  @ApiParam({
    name: 'tournamentId',
    description: 'The target tournament UUID',
    example: '87fa678b-1234-5678-9abc-def012345678',
  })
  async getPassByTournament(
    @Req() req: RequestWithUser,
    @Param('tournamentId') tournamentId: string,
  ) {
    const playerId = req.user.userId;
    const data = await this.playerPassService.getPassByTournament(playerId, tournamentId);
    return sendResponse({
      message: 'Competitor secure card retrieved successfully',
      data,
    });
  }

  /**
   * 3. Tab 2: 💰 PAYOUT LEDGER - Balance
   * Retrieves Withdrawable Ledger & Non-Withdrawable Credits for balance pills.
   */
  @Get('balance')
  @ApiOperation({
    summary: 'Get Player Withdrawable Ledger & Credit Balances (Header Cash Pill)',
    description:
      'Returns cash balance (Withdrawable Ledger), credit balance (Non-Withdrawable Credits), and escrow reserves.',
  })
  async getWalletBalance(@Req() req: RequestWithUser) {
    const playerId = req.user.userId;
    const data = await this.playerWalletService.getWalletBalance(playerId);
    return sendResponse({
      message: 'Wallet balance retrieved successfully',
      data,
    });
  }

  /**
   * 4. Tab 2: 💰 PAYOUT LEDGER - Ledger History Table
   * Retrieves the transaction history table for the financial ledger.
   */
  @Get('ledger')
  @ApiOperation({
    summary: 'Get Player Financial Ledger History Table (with pagination)',
    description:
      'Lists debit and credit postings with types, formatted dates, amounts, and audit references.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  async getLedgerHistory(
    @Req() req: RequestWithUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const playerId = req.user.userId;
    const data = await this.playerWalletService.getLedgerHistory(playerId, { page, limit });
    return sendResponse({
      message: 'Financial ledger history retrieved successfully',
      data,
      meta: (data as any)?.meta || (data as any)?.pagination,
    });
  }

  /**
   * 5. Tab 2: 💰 PAYOUT LEDGER - Disburse Payout Request Form
   * Submits a NUBAN bank account payout settlement with atomic verification.
   */
  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disburse Payout Requests (REQUEST LEDGER SETTLEMENT)',
    description:
      'Validates 10-digit NUBAN card number, verifies minimum limit of ₦1,000, checks available cash, and dispatches clearing request.',
  })
  @ApiResponse({ status: 200, description: 'Payout request dispatched successfully' })
  @ApiResponse({ status: 400, description: 'Insufficient balance or invalid NUBAN' })
  async requestPayout(
    @Req() req: RequestWithUser,
    @Body() dto: RequestPayoutDto,
  ) {
    const playerId = req.user.userId;
    const data = await this.playerWalletService.requestPayout(playerId, dto);
    return sendResponse({
      message: data.message,
      data: data.data,
    });
  }

  /**
   * 6. Unified Hub Overview
   * Combines passes count, balances, and recent ledger in one single payload for instant page rendering.
   */
  @Get('overview')
  @ApiOperation({
    summary: 'Unified Player Wallet Hub (Balance + Passes KPI + Recent Transactions)',
  })
  async getWalletOverview(@Req() req: RequestWithUser) {
    const playerId = req.user.userId;
    const data = await this.playerWalletService.getWalletOverview(playerId);
    return sendResponse({
      message: 'Wallet overview retrieved successfully',
      data,
    });
  }
}
