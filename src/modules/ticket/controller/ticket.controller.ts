import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiHeader,
  ApiResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { TicketService } from '../service/ticket.service';
import { PurchaseTicketDto } from '../dto/purchase-ticket.dto';
import { VerifyTicketDto } from '../dto/verify-ticket.dto';
import { CheckInTicketDto } from '../dto/check-in-ticket.dto';
import { CreateTierDto } from '../dto/create-tier.dto';
import { UpdateTierDto } from '../dto/update-tier.dto';
import { QueryTicketDto } from '../dto/query-ticket.dto';
import { TransferTicketDto } from '../dto/transfer-ticket.dto';
import { sendResponse } from '../../utils/response.util';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Role } from '@prisma/client';

@ApiTags('tickets')
@ApiBearerAuth()
@Controller('tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  /**
   * 1. Initialize Ticket Purchase Flow with Flutterwave
   * Accessible by Players and Fans (or any authenticated user)
   */
  @Post('purchase')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initialize ticket purchase with Flutterwave checkout URL & seat calculation',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns Flutterwave paymentLink, txRef, price calculation, and seat number',
  })
  async purchaseTicket(@Req() req: Request, @Body() dto: PurchaseTicketDto) {
    const user = (req as any).user;
    const data = await this.ticketService.initializePurchase(user, dto);
    return sendResponse({
      message: 'Ticket checkout initiated successfully. Redirect to payment link to complete payment.',
      data,
    });
  }

  /**
   * 2. Verify Flutterwave Payment and Issue Ticket (POST)
   */
  @Post('verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify Flutterwave payment by txRef/transactionId and issue ticket(s)',
  })
  async verifyPaymentPost(@Body() dto: VerifyTicketDto) {
    const data = await this.ticketService.verifyPaymentAndIssueTicket(
      dto.txRef,
      dto.transactionId,
    );
    return sendResponse({
      message: 'Payment verified and ticket(s) generated successfully',
      data,
    });
  }

  /**
   * 3. Verify Flutterwave Payment by txRef Parameter (GET - useful for client redirection)
   */
  @Get('verify/:txRef')
  @Public()
  @ApiOperation({
    summary: 'Verify Flutterwave payment by transaction reference (URL param) and issue ticket',
  })
  @ApiParam({ name: 'txRef', description: 'Flutterwave transaction reference' })
  async verifyPaymentGet(
    @Param('txRef') txRef: string,
    @Query('transaction_id') transactionId?: string,
  ) {
    const data = await this.ticketService.verifyPaymentAndIssueTicket(
      txRef,
      transactionId,
    );
    return sendResponse({
      message: 'Payment verified and ticket(s) issued successfully',
      data,
    });
  }

  /**
   * 4. Flutterwave Webhook Listener
   */
  @Post('flutterwave-webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook endpoint for Flutterwave payment notifications' })
  @ApiHeader({ name: 'verif-hash', required: false })
  async handleFlutterwaveWebhook(
    @Body() body: any,
    @Headers('verif-hash') signature?: string,
  ) {
    const data = await this.ticketService.handleWebhook(body, signature);
    return sendResponse({
      message: 'Webhook received',
      data,
    });
  }

  /**
   * 5. QR Code Venue Check-In (Scanner Parity with QRScannerModal)
   */
  @Post('check-in')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Venue check-in: validates QR code token, marks ticket USED, logs entry',
  })
  async checkInByQr(@Req() req: Request, @Body() dto: CheckInTicketDto) {
    const user = (req as any).user;
    const data = await this.ticketService.checkInByQr(dto, user);
    return sendResponse({
      message: data.message,
      data,
    });
  }

  /**
   * 6. User's Purchased Tickets Wallet (Total Passes, Active Codes, and Registered Passes)
   */
  @Get('my-tickets')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Get user ticket wallet with KPI counts (Total Passes, Active Codes) and entrance passes',
  })
  async getMyTickets(@Req() req: Request) {
    const user = (req as any).user;
    const data = await this.ticketService.getMyTickets(user?.userId);
    return sendResponse({
      message: 'User tickets retrieved successfully',
      data,
    });
  }

  /**
   * 7. Transfer Ticket Pass to Another Fan / Player
   */
  @Post('transfer')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Transfer an active ticket pass to another recipient via phone number or email (locks sender access)',
  })
  async transferTicket(@Req() req: Request, @Body() dto: TransferTicketDto) {
    const user = (req as any).user;
    const data = await this.ticketService.transferTicket(user, dto);
    return sendResponse({
      message: data.message,
      data,
    });
  }

  /**
   * 7. Global Ticket Sales & Analytics (Dashboard / TicketSalesAnalytics.tsx)
   */
  @Get('analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Get comprehensive ticket sales and revenue analytics for admin dashboard',
  })
  async getAnalytics() {
    const data = await this.ticketService.getGlobalAnalytics();
    return sendResponse({
      message: 'Ticket analytics retrieved successfully',
      data,
    });
  }

  /**
   * 8. Tournament Capacity & Seat Calculations Summary
   */
  @Get('tournament/:tournamentId/summary')
  @Public()
  @ApiOperation({
    summary: 'Get seat capacity, remaining seats, revenue, and tier breakdown for a tournament',
  })
  @ApiParam({ name: 'tournamentId', description: 'Tournament ID' })
  async getTournamentSummary(@Param('tournamentId') tournamentId: string) {
    const data =
      await this.ticketService.calculateTournamentCapacityAndSeats(tournamentId);
    return sendResponse({
      message: 'Tournament ticket and seat calculations retrieved successfully',
      data,
    });
  }

  /**
   * 9. Get Tiers for a Tournament
   */
  @Get('tournament/:tournamentId/tiers')
  @Public()
  @ApiOperation({ summary: 'Get all ticket tiers for a tournament' })
  @ApiParam({ name: 'tournamentId', description: 'Tournament ID' })
  async getTournamentTiers(@Param('tournamentId') tournamentId: string) {
    const data = await this.ticketService.getTiersByTournament(tournamentId);
    return sendResponse({
      message: 'Ticket tiers retrieved successfully',
      data,
    });
  }

  /**
   * 10. Create Ticket Tier (Admin / Organizer)
   */
  @Post('tiers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create a new ticket tier for a tournament' })
  async createTier(@Body() dto: CreateTierDto) {
    const data = await this.ticketService.createTier(dto);
    return sendResponse({
      message: 'Ticket tier created successfully',
      data,
    });
  }

  /**
   * 11. Update Ticket Tier
   */
  @Put('tiers/:tierId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Update an existing ticket tier' })
  @ApiParam({ name: 'tierId', description: 'Tier ID' })
  async updateTier(
    @Param('tierId') tierId: string,
    @Body() dto: UpdateTierDto,
  ) {
    const data = await this.ticketService.updateTier(tierId, dto);
    return sendResponse({
      message: 'Ticket tier updated successfully',
      data,
    });
  }

  /**
   * 12. Delete Ticket Tier
   */
  @Delete('tiers/:tierId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete a ticket tier (only if no tickets sold)' })
  @ApiParam({ name: 'tierId', description: 'Tier ID' })
  async deleteTier(@Param('tierId') tierId: string) {
    const data = await this.ticketService.deleteTier(tierId);
    return sendResponse({
      message: 'Ticket tier deleted successfully',
      data,
    });
  }

  /**
   * 13. Get Single Ticket by ID
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get single ticket details and digital pass by ID' })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  async getTicketById(@Param('id') id: string) {
    const data = await this.ticketService.getTicketById(id);
    return sendResponse({
      message: 'Ticket details retrieved successfully',
      data,
    });
  }

  /**
   * 14. List All Tickets (Admin)
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get all tickets with pagination, filters, and search' })
  async getAllTickets(@Query() query: QueryTicketDto) {
    const { data, meta } = await this.ticketService.getAllTickets(query);
    return sendResponse({
      message: 'Tickets retrieved successfully',
      data,
      meta,
    });
  }
}
