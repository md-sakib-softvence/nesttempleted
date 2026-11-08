import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { sendResponse } from '../../utils/response.util';
import { PlayerWalletService } from '../service/player-wallet.service';
import {
  CompletePayoutDto,
  FailPayoutDto,
  ReviewPayoutDto,
  StartPayoutProcessingDto,
} from '../dto/update-payout-status.dto';

interface AdminRequest extends Request {
  user: { userId: string; role: string; email?: string };
}

@ApiTags('admin/payouts')
@ApiBearerAuth()
@Controller('admin/payouts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
export class AdminPayoutController {
  constructor(private readonly walletService: PlayerWalletService) {}

  @Get()
  @ApiOperation({ summary: 'List player payout requests for finance/clearing review' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async list(
    @Query('status') status: string | undefined,
    @Query('page') page: number | undefined,
    @Query('limit') limit: number | undefined,
  ) {
    const data = await this.walletService.listPayoutRequests({ status, page, limit });
    return sendResponse({ message: 'Payout requests retrieved successfully', data, meta: data.pagination });
  }

  @Patch(':payoutId/review')
  @ApiOperation({ summary: 'Approve a payout for clearing or reject and refund it' })
  async review(
    @Param('payoutId') payoutId: string,
    @Body() dto: ReviewPayoutDto,
    @Req() req: AdminRequest,
  ) {
    const data = await this.walletService.reviewPayout(payoutId, dto, req.user.userId, req.user.role, req.user.email);
    return sendResponse({ message: `Payout ${dto.status.toLowerCase()}`, data });
  }

  @Patch(':payoutId/processing')
  @ApiOperation({ summary: 'Record that clearing initiated the external bank transfer' })
  async startProcessing(
    @Param('payoutId') payoutId: string,
    @Body() dto: StartPayoutProcessingDto,
    @Req() req: AdminRequest,
  ) {
    const data = await this.walletService.startPayoutProcessing(payoutId, dto, req.user.userId, req.user.role, req.user.email);
    return sendResponse({ message: 'Payout marked as processing', data });
  }

  @Patch(':payoutId/complete')
  @ApiOperation({ summary: 'Confirm a bank transfer that has independently succeeded' })
  async complete(
    @Param('payoutId') payoutId: string,
    @Body() dto: CompletePayoutDto,
    @Req() req: AdminRequest,
  ) {
    const data = await this.walletService.completePayout(payoutId, dto, req.user.userId, req.user.role, req.user.email);
    return sendResponse({ message: 'Payout completed successfully', data });
  }

  @Patch(':payoutId/fail')
  @ApiOperation({ summary: 'Record a failed transfer and refund the reserved player balance' })
  async fail(
    @Param('payoutId') payoutId: string,
    @Body() dto: FailPayoutDto,
    @Req() req: AdminRequest,
  ) {
    const data = await this.walletService.failPayout(payoutId, dto, req.user.userId, req.user.role, req.user.email);
    return sendResponse({ message: 'Payout failure recorded and balance refunded', data });
  }
}
