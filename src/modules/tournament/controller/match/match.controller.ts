import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { TournamentService } from '../../service/tournament.service';
import { UpdateMatchScoreDto } from '../../dto/tournament/update-match-score.dto';
import { ScoreCorrectionDto } from '../../dto/tournament/score-correction.dto';
import { CreateMatchDisputeDto } from '../../dto/tournament/match-dispute.dto';
import { UpdateMatchDisputeDto } from '../../dto/tournament/update-dispute.dto';
import { AllocateMatchDto } from '../../dto/tournament/allocate-match.dto';
import { ProposeSlotDto } from '../../dto/tournament/propose-slot.dto';
import { EmergencyAppealDto } from '../../dto/tournament/emergency-appeal.dto';
import { sendResponse } from '../../../utils/response.util';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Matches & Fixtures')
@ApiBearerAuth()
@Controller('matches')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  Role.PLAYER,
  'player' as any,
  Role.ADMIN,
  Role.SUPER_ADMIN,
  'admin' as any,
  'super_admin' as any,
)
export class AdminMatchController {
  constructor(private readonly tournamentService: TournamentService) {}

  @Post(':matchId/self-book')
  @Roles(
    Role.PLAYER,
    'player' as any,
    Role.ADMIN,
    Role.SUPER_ADMIN,
    'admin' as any,
    'super_admin' as any,
  )
  @ApiOperation({
    summary: 'Player Self-Booking Fixture (Canonical Match Scheduling)',
    description:
      'Allows a competitor to schedule their match fixture in PLAYER_SELF scheduling mode. Validates player participation, open window, and interval collision.',
  })
  @ApiParam({ name: 'matchId', description: 'Canonical Match ID' })
  @ApiResponse({ status: 200, description: 'Match fixture booked successfully' })
  async selfBookMatch(
    @Param('matchId') matchId: string,
    @Body() body: AllocateMatchDto,
    @Req() req: any,
  ) {
    const data = await this.tournamentService.selfBookMatch(
      matchId,
      body,
      req.user,
    );
    return sendResponse({
      message: 'Match fixture successfully scheduled',
      data,
    });
  }

  @Get('player/calendar')
  @Roles(
    Role.PLAYER,
    'player' as any,
    Role.ADMIN,
    Role.SUPER_ADMIN,
    'admin' as any,
    'super_admin' as any,
  )
  @ApiOperation({
    summary: 'Get Player Match Calendar',
    description:
      'Returns upcoming booked fixtures and completed match history for the authenticated player.',
  })
  @ApiResponse({
    status: 200,
    description: 'Player match calendar retrieved successfully',
  })
  async getPlayerCalendar(@Req() req: any) {
    const data = await this.tournamentService.getPlayerScheduleCalendar(
      req.user.userId,
    );
    return sendResponse({
      message: 'Player calendar retrieved successfully',
      data,
    });
  }

  @Get(':matchId/details')
  @Roles(
    Role.PLAYER,
    'player' as any,
    Role.ADMIN,
    Role.SUPER_ADMIN,
    'admin' as any,
    'super_admin' as any,
    Role.FAN,
    'fan' as any,
  )
  @ApiOperation({
    summary: 'Get Match Showdown Info',
    description:
      'Returns full showdown details including participant cards, arena details, and rules.',
  })
  @ApiParam({ name: 'matchId', description: 'Canonical Match ID' })
  @ApiResponse({
    status: 200,
    description: 'Match showdown details retrieved successfully',
  })
  async getMatchDetails(@Param('matchId') matchId: string) {
    const data =
      await this.tournamentService.getMatchShowdownDetails(matchId);
    return sendResponse({
      message: 'Match showdown details retrieved successfully',
      data,
    });
  }

  @Post(':matchId/propose-slot')
  @Roles(
    Role.PLAYER,
    'player' as any,
    Role.ADMIN,
    Role.SUPER_ADMIN,
    'admin' as any,
    'super_admin' as any,
  )
  @ApiOperation({
    summary: 'Propose / Cast Timeslot for Match',
    description:
      'Home or Away competitor casts a proposed timeslot for opponent visibility and fast-matching.',
  })
  @ApiParam({ name: 'matchId', description: 'Canonical Match ID' })
  @ApiResponse({
    status: 200,
    description: 'Timeslot proposal submitted successfully',
  })
  async proposeSlot(
    @Param('matchId') matchId: string,
    @Body() body: ProposeSlotDto,
    @Req() req: any,
  ) {
    const data = await this.tournamentService.proposeSlot(
      '',
      matchId,
      req.user.userId,
      body,
    );
    return sendResponse({
      message: 'Timeslot proposed successfully',
      data,
    });
  }

  @Post(':matchId/emergency-appeal')
  @Roles(
    Role.PLAYER,
    'player' as any,
    Role.ADMIN,
    Role.SUPER_ADMIN,
    'admin' as any,
    'super_admin' as any,
  )
  @ApiOperation({
    summary: 'Submit Emergency Token Appeal',
    description:
      'Consumes player 1/1 emergency token to unlock scheduling coordination for overdue matches.',
  })
  @ApiParam({ name: 'matchId', description: 'Canonical Match ID' })
  @ApiResponse({
    status: 200,
    description: 'Emergency token appeal submitted successfully',
  })
  async emergencyAppeal(
    @Param('matchId') matchId: string,
    @Body() body: EmergencyAppealDto,
    @Req() req: any,
  ) {
    const data = await this.tournamentService.emergencyTokenAppeal(
      '',
      matchId,
      req.user.userId,
      body,
    );
    return sendResponse({
      message: 'Emergency appeal submitted successfully',
      data,
    });
  }

  @Post(':matchId/score')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin' as any, 'super_admin' as any)
  @ApiOperation({
    summary:
      'Enters match score. Backend handles winner determination and propagates winner to next match.',
  })
  @ApiParam({ name: 'matchId', description: 'Canonical Match ID' })
  @ApiResponse({ status: 200, description: 'Score entered and winner propagated' })
  async updateScore(
    @Param('matchId') matchId: string,
    @Body() body: UpdateMatchScoreDto,
  ) {
    const data = await this.tournamentService.updateMatchScore('', matchId, body);
    return sendResponse({
      message: 'Match score updated and winner propagated successfully',
      data,
    });
  }

  @Post(':matchId/score-correction')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin' as any, 'super_admin' as any)
  @ApiOperation({
    summary:
      'Privileged admin score correction with audit trail. Guards against overwriting completed downstream matches.',
  })
  @ApiParam({ name: 'matchId', description: 'Canonical Match ID' })
  @ApiResponse({ status: 200, description: 'Match score corrected with audit log' })
  async scoreCorrection(
    @Param('matchId') matchId: string,
    @Body() body: ScoreCorrectionDto,
  ) {
    const data = await this.tournamentService.correctMatchScore(matchId, body);
    return sendResponse({
      message: 'Match score corrected successfully with audit log created',
      data,
    });
  }

  @Post(':matchId/dispute')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin' as any, 'super_admin' as any)
  @ApiOperation({ summary: 'Flags a match under review' })
  @ApiParam({ name: 'matchId', description: 'Canonical Match ID' })
  @ApiResponse({ status: 200, description: 'Match flagged as UNDER_REVIEW' })
  async disputeMatch(
    @Param('matchId') matchId: string,
    @Body() body: CreateMatchDisputeDto,
  ) {
    const data = await this.tournamentService.disputeMatch(matchId, body);
    return sendResponse({
      message: 'Match marked under review and dispute logged successfully',
      data,
    });
  }

  @Post(':matchId/allocation')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin' as any, 'super_admin' as any)
  @ApiOperation({
    summary:
      'Manually assigns a match to a venue screen and timeslot. Checks screen collision and player time overlap.',
  })
  @ApiParam({ name: 'matchId', description: 'Canonical Match ID' })
  @ApiResponse({ status: 200, description: 'Match allocated to physical timeslot' })
  async allocate(
    @Param('matchId') matchId: string,
    @Body() body: AllocateMatchDto,
  ) {
    const data = await this.tournamentService.allocateTournamentMatch(
      '',
      matchId,
      body,
    );
    return sendResponse({
      message: 'Match allocated to physical slot successfully',
      data,
    });
  }

  @Delete(':matchId/allocation')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin' as any, 'super_admin' as any)
  @ApiOperation({ summary: 'De-allocates a match from its timeslot' })
  @ApiParam({ name: 'matchId', description: 'Canonical Match ID' })
  @ApiResponse({ status: 200, description: 'Match unallocated' })
  async unallocate(@Param('matchId') matchId: string) {
    const data = await this.tournamentService.unallocateTournamentMatch(
      '',
      matchId,
    );
    return sendResponse({
      message: 'Match de-allocated from physical slot successfully',
      data,
    });
  }
}

@ApiTags('Admin Match Disputes')
@ApiBearerAuth()
@Controller('disputes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class AdminDisputeController {
  constructor(private readonly tournamentService: TournamentService) {}

  @Patch(':disputeId')
  @ApiOperation({ summary: 'Resolves a match dispute' })
  @ApiParam({ name: 'disputeId', description: 'Dispute ID' })
  @ApiResponse({ status: 200, description: 'Dispute resolved' })
  async resolveDispute(
    @Param('disputeId') disputeId: string,
    @Body() body: UpdateMatchDisputeDto,
  ) {
    const data = await this.tournamentService.resolveMatchDispute(
      disputeId,
      body,
    );
    return sendResponse({
      message: 'Match dispute resolved successfully',
      data,
    });
  }
}
