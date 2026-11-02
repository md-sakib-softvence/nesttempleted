import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { sendResponse } from '../../../utils/response.util';
import { CreateMatchDisputeDto } from '../../dto/tournament/match-dispute.dto';
import { MatchIncidentService } from '../../service/match-incident.service';

@ApiTags('Match incidents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN', 'MANAGER', 'EMPLOYEE')
@Controller()
export class MatchIncidentController {
  constructor(private readonly incidents: MatchIncidentService) {}

  @Post('tournaments/:id/matches/:matchId/disputes')
  @ApiOperation({ summary: 'Report an incident, pause the match and notify managers/admins' })
  async report(@Param('id') id: string, @Param('matchId') matchId: string, @Body() dto: CreateMatchDisputeDto, @Req() req: any) {
    return sendResponse({ message: 'Incident saved. Match paused for review.', data: await this.incidents.create(id, matchId, dto, req.user) });
  }

  @Post('tournaments/:id/matches/:matchId/resume')
  @ApiOperation({ summary: 'Restart a checked-in match after its incident is resolved' })
  async resume(@Param('id') id: string, @Param('matchId') matchId: string, @Req() req: any) {
    return sendResponse({ message: 'Match restarted', data: await this.incidents.resume(id, matchId, req.user) });
  }

  @Get('disputes')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MANAGER')
  async list(@Query('tournamentId') tournamentId: string | undefined, @Req() req: any) {
    return sendResponse({ message: 'Match incidents retrieved', data: await this.incidents.list(req.user, tournamentId) });
  }

  @Get('disputes/:id')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MANAGER')
  async detail(@Param('id') id: string, @Req() req: any) {
    return sendResponse({ message: 'Match incident details retrieved', data: await this.incidents.detail(id, req.user) });
  }
}
