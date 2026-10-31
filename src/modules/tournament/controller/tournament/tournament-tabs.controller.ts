import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Public } from '../../../../common/decorators/public.decorator';
import { Role } from '@prisma/client';
import { TournamentTabsService } from '../../service/tournament-tabs.service';
import { sendResponse } from '../../../utils/response.util';
import {
  UpdateDetailsTabDto,
  UpdateRegistrationsTabDto,
  UpdateScheduleTabDto,
  UpdateLeaderboardsTabDto,
  UpdateRafflesTabDto,
  UpdatePlayerCardTemplateTabDto,
  UpdateFanPassTemplateTabDto,
  UpdateRulesTabDto,
  UpdateTermsTabDto,
  UpdateSettingsTabDto,
} from '../../dto/tournament-tabs/tournament-tabs.dto';
import {
  uploadTournamentFiles,
  rollbackTournamentFiles,
} from '../../utils/file-upload.util';

@ApiTags('tournament-tabs')
@ApiBearerAuth()
@Controller('tournaments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TournamentTabsController {
  constructor(private readonly tabsService: TournamentTabsService) {}

  // ==========================================
  // TAB 1: DETAILS
  // ==========================================

  @Public()
  @Get(':id/tabs/details')
  @ApiOperation({
    summary:
      'Get Tournament Details tab (Basic Information, Financial Settings, Venue Utilization Heatmap)',
  })
  async getDetailsTab(@Param('id') id: string) {
    const data = await this.tabsService.getDetailsTab(id);
    return sendResponse({
      message: 'Tournament Details tab retrieved successfully',
      data,
    });
  }

  @Patch(':id/tabs/details')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update Tournament Details tab' })
  async patchDetailsTab(
    @Param('id') id: string,
    @Body() dto: UpdateDetailsTabDto,
  ) {
    const data = await this.tabsService.patchDetailsTab(id, dto);
    return sendResponse({
      message: 'Tournament Details tab updated successfully',
      data,
    });
  }

  // ==========================================
  // TAB 2: REGISTRATIONS
  // ==========================================

  @Public()
  @Get(':id/tabs/registrations')
  @ApiOperation({
    summary:
      'Get Tournament Registrations tab (Counts and segmented lists: Registered, Selected Unpaid, Confirmed, Waitlist)',
  })
  async getRegistrationsTab(@Param('id') id: string) {
    const data = await this.tabsService.getRegistrationsTab(id);
    return sendResponse({
      message: 'Tournament Registrations tab retrieved successfully',
      data,
    });
  }

  @Patch(':id/tabs/registrations')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Update Tournament Registrations tab (Open/Close, mode, capacity, player selection)',
  })
  async patchRegistrationsTab(
    @Param('id') id: string,
    @Body() dto: UpdateRegistrationsTabDto,
  ) {
    const data = await this.tabsService.patchRegistrationsTab(id, dto);
    return sendResponse({
      message: 'Tournament Registrations tab updated successfully',
      data,
    });
  }

  // ==========================================
  // TAB 3: SCHEDULE & RESULTS
  // ==========================================

  @Public()
  @Get(':id/tabs/schedule')
  @ApiOperation({
    summary:
      'Get Tournament Schedule & Results tab (Scheduling mode, settings, matches, calendar, groups)',
  })
  async getScheduleTab(@Param('id') id: string) {
    const data = await this.tabsService.getScheduleTab(id);
    return sendResponse({
      message: 'Tournament Schedule tab retrieved successfully',
      data,
    });
  }

  @Patch(':id/tabs/schedule')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Update Tournament Schedule & Results tab (Mode, timing settings, pause/resume)',
  })
  async patchScheduleTab(
    @Param('id') id: string,
    @Body() dto: UpdateScheduleTabDto,
  ) {
    const data = await this.tabsService.patchScheduleTab(id, dto);
    return sendResponse({
      message: 'Tournament Schedule tab updated successfully',
      data,
    });
  }

  // ==========================================
  // TAB 4: LEADERBOARDS
  // ==========================================

  @Public()
  @Get([':id/tabs/leaderboards', ':id/tabs/leaderboard'])
  @ApiOperation({
    summary:
      'Get Tournament Leaderboards tab (Standings table, series leaderboard if linked)',
  })
  async getLeaderboardsTab(@Param('id') id: string) {
    const data = await this.tabsService.getLeaderboardsTab(id);
    return sendResponse({
      message: 'Tournament Leaderboards tab retrieved successfully',
      data,
    });
  }

  @Patch([':id/tabs/leaderboards', ':id/tabs/leaderboard'])
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update Tournament Leaderboards tab' })
  async patchLeaderboardsTab(
    @Param('id') id: string,
    @Body() dto: UpdateLeaderboardsTabDto,
  ) {
    const data = await this.tabsService.patchLeaderboardsTab(id, dto);
    return sendResponse({
      message: 'Tournament Leaderboards tab updated successfully',
      data,
    });
  }

  // ==========================================
  // TAB 5: RAFFLES
  // ==========================================

  @Public()
  @Get(':id/tabs/raffles')
  @ApiOperation({
    summary: 'Get Tournament Raffles tab (List of raffles, status, dates, winners)',
  })
  async getRafflesTab(@Param('id') id: string) {
    const data = await this.tabsService.getRafflesTab(id);
    return sendResponse({
      message: 'Tournament Raffles tab retrieved successfully',
      data,
    });
  }

  @Patch(':id/tabs/raffles')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update Tournament Raffles tab' })
  async patchRafflesTab(
    @Param('id') id: string,
    @Body() dto: UpdateRafflesTabDto,
  ) {
    const data = await this.tabsService.patchRafflesTab(id, dto);
    return sendResponse({
      message: 'Tournament Raffles tab updated successfully',
      data,
    });
  }

  // ==========================================
  // TAB 6: PLAYER CARD TEMPLATE
  // ==========================================

  @Public()
  @Get([':id/tabs/player-card-template', ':id/tabs/playerCardTemplate'])
  @ApiOperation({
    summary:
      'Get Tournament Player Card Template tab (Logos, canvas art, player sponsors, template config)',
  })
  async getPlayerCardTemplateTab(@Param('id') id: string) {
    const data = await this.tabsService.getPlayerCardTemplateTab(id);
    return sendResponse({
      message: 'Tournament Player Card Template tab retrieved successfully',
      data,
    });
  }

  @Patch([':id/tabs/player-card-template', ':id/tabs/playerCardTemplate'])
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Update Tournament Player Card Template tab (Optional file uploads or JSON)',
  })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'canvasImage', maxCount: 1 },
      { name: 'playerOrgUrl', maxCount: 1 },
      { name: 'organizerLogo', maxCount: 1 },
      { name: 'prOrgUrl', maxCount: 1 },
      { name: 'secondaryOrganizerLogo', maxCount: 1 },
      { name: 'tournamentLogoUrl', maxCount: 1 },
      { name: 'tournamentLogo', maxCount: 1 },
      { name: 'logo', maxCount: 1 },
    ]),
  )
  async patchPlayerCardTemplateTab(
    @Param('id') id: string,
    @Body() dto: UpdatePlayerCardTemplateTabDto,
    @UploadedFiles()
    files?: {
      canvasImage?: Express.Multer.File[];
      playerOrgUrl?: Express.Multer.File[];
      organizerLogo?: Express.Multer.File[];
      prOrgUrl?: Express.Multer.File[];
      secondaryOrganizerLogo?: Express.Multer.File[];
      tournamentLogoUrl?: Express.Multer.File[];
      tournamentLogo?: Express.Multer.File[];
      logo?: Express.Multer.File[];
    },
  ) {
    let uploadedFiles: any = null;
    if (files && Object.keys(files).length > 0) {
      uploadedFiles = await uploadTournamentFiles(files);
      if (uploadedFiles.canvasImage) dto.canvasImage = uploadedFiles.canvasImage;
      if (uploadedFiles.playerOrgUrl)
        dto.playerOrgUrl = uploadedFiles.playerOrgUrl;
      if (uploadedFiles.prOrgUrl) dto.prOrgUrl = uploadedFiles.prOrgUrl;
      if (uploadedFiles.tournamentLogoUrl)
        dto.tournamentLogoUrl = uploadedFiles.tournamentLogoUrl;
    }

    try {
      const data = await this.tabsService.patchPlayerCardTemplateTab(id, dto);
      return sendResponse({
        message: 'Tournament Player Card Template updated successfully',
        data,
      });
    } catch (err) {
      if (uploadedFiles) await rollbackTournamentFiles(uploadedFiles);
      throw err;
    }
  }

  // ==========================================
  // TAB 7: FAN PASS TEMPLATE
  // ==========================================

  @Public()
  @Get([':id/tabs/fan-pass-template', ':id/tabs/fanPassTemplate'])
  @ApiOperation({
    summary:
      'Get Tournament Fan Pass Template tab (Logos, background art, fan sponsors, template config)',
  })
  async getFanPassTemplateTab(@Param('id') id: string) {
    const data = await this.tabsService.getFanPassTemplateTab(id);
    return sendResponse({
      message: 'Tournament Fan Pass Template tab retrieved successfully',
      data,
    });
  }

  @Patch([':id/tabs/fan-pass-template', ':id/tabs/fanPassTemplate'])
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Update Tournament Fan Pass Template tab (Optional file uploads or JSON)',
  })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'canvasImage', maxCount: 1 },
      { name: 'fanPassArtUrl', maxCount: 1 },
      { name: 'playerOrgUrl', maxCount: 1 },
      { name: 'organizerLogo', maxCount: 1 },
      { name: 'prOrgUrl', maxCount: 1 },
      { name: 'secondaryOrganizerLogo', maxCount: 1 },
      { name: 'tournamentLogoUrl', maxCount: 1 },
      { name: 'tournamentLogo', maxCount: 1 },
      { name: 'logo', maxCount: 1 },
    ]),
  )
  async patchFanPassTemplateTab(
    @Param('id') id: string,
    @Body() dto: UpdateFanPassTemplateTabDto,
    @UploadedFiles()
    files?: {
      canvasImage?: Express.Multer.File[];
      fanPassArtUrl?: Express.Multer.File[];
      playerOrgUrl?: Express.Multer.File[];
      organizerLogo?: Express.Multer.File[];
      prOrgUrl?: Express.Multer.File[];
      secondaryOrganizerLogo?: Express.Multer.File[];
      tournamentLogoUrl?: Express.Multer.File[];
      tournamentLogo?: Express.Multer.File[];
      logo?: Express.Multer.File[];
    },
  ) {
    let uploadedFiles: any = null;
    if (files && Object.keys(files).length > 0) {
      uploadedFiles = await uploadTournamentFiles(files);
      if (uploadedFiles.canvasImage)
        dto.fanPassArtUrl = uploadedFiles.canvasImage;
      if (uploadedFiles.playerOrgUrl)
        dto.playerOrgUrl = uploadedFiles.playerOrgUrl;
      if (uploadedFiles.prOrgUrl) dto.prOrgUrl = uploadedFiles.prOrgUrl;
      if (uploadedFiles.tournamentLogoUrl)
        dto.tournamentLogoUrl = uploadedFiles.tournamentLogoUrl;
    }

    try {
      const data = await this.tabsService.patchFanPassTemplateTab(id, dto);
      return sendResponse({
        message: 'Tournament Fan Pass Template updated successfully',
        data,
      });
    } catch (err) {
      if (uploadedFiles) await rollbackTournamentFiles(uploadedFiles);
      throw err;
    }
  }

  // ==========================================
  // TAB 8: RULES
  // ==========================================

  @Public()
  @Get(':id/tabs/rules')
  @ApiOperation({ summary: 'Get Tournament Rules tab (Rules list and document URL)' })
  async getRulesTab(@Param('id') id: string) {
    const data = await this.tabsService.getRulesTab(id);
    return sendResponse({
      message: 'Tournament Rules tab retrieved successfully',
      data,
    });
  }

  @Patch(':id/tabs/rules')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update Tournament Rules tab (Files or JSON)' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'rules', maxCount: 10 }]))
  async patchRulesTab(
    @Param('id') id: string,
    @Body() dto: UpdateRulesTabDto,
    @UploadedFiles() files?: { rules?: Express.Multer.File[] },
  ) {
    let uploadedFiles: any = null;
    if (files?.rules && files.rules.length > 0) {
      uploadedFiles = await uploadTournamentFiles(files);
      if (uploadedFiles.rules.length > 0) {
        dto.rules = uploadedFiles.rules;
      }
    }

    try {
      const data = await this.tabsService.patchRulesTab(id, dto);
      return sendResponse({
        message: 'Tournament Rules tab updated successfully',
        data,
      });
    } catch (err) {
      if (uploadedFiles) await rollbackTournamentFiles(uploadedFiles);
      throw err;
    }
  }

  // ==========================================
  // TAB 9: T&CS (TERMS & CONDITIONS)
  // ==========================================

  @Public()
  @Get([':id/tabs/terms', ':id/tabs/tsAndTc', ':id/tabs/tcs'])
  @ApiOperation({
    summary:
      'Get Tournament T&Cs tab (Terms and conditions list and document URL)',
  })
  async getTermsTab(@Param('id') id: string) {
    const data = await this.tabsService.getTermsTab(id);
    return sendResponse({
      message: 'Tournament T&Cs tab retrieved successfully',
      data,
    });
  }

  @Patch([':id/tabs/terms', ':id/tabs/tsAndTc', ':id/tabs/tcs'])
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Update Tournament T&Cs tab (Files or JSON)',
  })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'termsAndConditions', maxCount: 10 },
      { name: 'tsAndTc', maxCount: 10 },
    ]),
  )
  async patchTermsTab(
    @Param('id') id: string,
    @Body() dto: UpdateTermsTabDto,
    @UploadedFiles()
    files?: {
      termsAndConditions?: Express.Multer.File[];
      tsAndTc?: Express.Multer.File[];
    },
  ) {
    let uploadedFiles: any = null;
    if (
      (files?.termsAndConditions && files.termsAndConditions.length > 0) ||
      (files?.tsAndTc && files.tsAndTc.length > 0)
    ) {
      uploadedFiles = await uploadTournamentFiles(files);
      if (uploadedFiles.tsAndTc.length > 0) {
        dto.tsAndTc = uploadedFiles.tsAndTc;
        dto.termsAndConditions = uploadedFiles.tsAndTc;
      }
    }

    try {
      const data = await this.tabsService.patchTermsTab(id, dto);
      return sendResponse({
        message: 'Tournament T&Cs tab updated successfully',
        data,
      });
    } catch (err) {
      if (uploadedFiles) await rollbackTournamentFiles(uploadedFiles);
      throw err;
    }
  }

  // ==========================================
  // TAB 10: SETTINGS
  // ==========================================

  @Public()
  @Get(':id/tabs/settings')
  @ApiOperation({
    summary:
      'Get Tournament Settings tab (Full settings, venues, screens, costs, prize payouts)',
  })
  async getSettingsTab(@Param('id') id: string) {
    const data = await this.tabsService.getSettingsTab(id);
    return sendResponse({
      message: 'Tournament Settings tab retrieved successfully',
      data,
    });
  }

  @Patch(':id/tabs/settings')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update Tournament Settings tab' })
  async patchSettingsTab(
    @Param('id') id: string,
    @Body() dto: UpdateSettingsTabDto,
  ) {
    const data = await this.tabsService.patchSettingsTab(id, dto);
    return sendResponse({
      message: 'Tournament Settings tab updated successfully',
      data,
    });
  }

  // ==========================================
  // DYNAMIC TAB DISPATCHER (:tabName)
  // ==========================================

  @Public()
  @Get(':id/tabs/:tabName')
  @ApiOperation({
    summary:
      'Dynamically fetch any Tournament tab by name (details, registrations, schedule, leaderboards, raffles, playerCardTemplate, fanPassTemplate, rules, terms, settings)',
  })
  async getTabByName(
    @Param('id') id: string,
    @Param('tabName') tabName: string,
  ) {
    const data = await this.tabsService.getTab(id, tabName);
    return sendResponse({
      message: `Tournament ${tabName} tab retrieved successfully`,
      data,
    });
  }

  @Patch(':id/tabs/:tabName')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Dynamically update any Tournament tab by name',
  })
  async patchTabByName(
    @Param('id') id: string,
    @Param('tabName') tabName: string,
    @Body() body: any,
  ) {
    const data = await this.tabsService.patchTab(id, tabName, body);
    return sendResponse({
      message: `Tournament ${tabName} tab updated successfully`,
      data,
    });
  }
}
