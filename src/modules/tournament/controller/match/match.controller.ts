import {
  Controller,
  Post,
  Patch,
  Delete,
  Body,
  Param,
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
import { sendResponse } from '../../../utils/response.util';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Admin Matches & Fixtures')
@ApiBearerAuth()
@Controller('matches')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class AdminMatchController {
  constructor(private readonly tournamentService: TournamentService) {}

  @Post(':matchId/score')
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
