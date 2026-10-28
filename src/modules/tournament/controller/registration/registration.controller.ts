import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { TournamentService } from '../../service/tournament.service';
import { sendResponse } from '../../../utils/response.util';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

export class ConfirmPaymentBodyDto {
  expectedVersion?: number;
  notes?: string;
}

export class RefundBodyDto {
  expectedVersion?: number;
  reason?: string;
}

@ApiTags('Admin Registrations & Roster')
@ApiBearerAuth()
@Controller('registrations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class AdminRegistrationController {
  constructor(private readonly tournamentService: TournamentService) {}

  @Post(':registrationId/confirm-payment')
  @ApiOperation({
    summary:
      'Admin manual/override confirmation of participant entry payment. Converts status to Confirmed, sets paymentStatus = PAID, and assigns to lowest available tournament slot.',
  })
  @ApiParam({
    name: 'registrationId',
    description: 'Tournament Registration ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment confirmed and slot assigned',
  })
  async confirmPayment(
    @Param('registrationId') registrationId: string,
    @Body() body?: ConfirmPaymentBodyDto,
  ) {
    const data = await this.tournamentService.confirmRegistrationPayment(
      registrationId,
      body?.expectedVersion,
      body?.notes,
    );
    return sendResponse({
      message: 'Participant payment confirmed and slot assigned successfully',
      data,
    });
  }

  @Post(':registrationId/refund')
  @ApiOperation({
    summary:
      'Refunds an entry fee, releases player slot, and moves registration to Waitlisted',
  })
  @ApiParam({
    name: 'registrationId',
    description: 'Tournament Registration ID',
  })
  @ApiResponse({ status: 200, description: 'Entry refunded and slot released' })
  async refund(
    @Param('registrationId') registrationId: string,
    @Body() body?: RefundBodyDto,
  ) {
    const data = await this.tournamentService.refundRegistration(
      registrationId,
      body?.expectedVersion,
      body?.reason,
    );
    return sendResponse({
      message: 'Entry fee refunded and slot released successfully',
      data,
    });
  }
}
