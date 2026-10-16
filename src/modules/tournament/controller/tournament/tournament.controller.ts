import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiQuery,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { TournamentService } from '../../service/tournament.service';
import { CreateTournamentDto } from '../../dto/tournament/create-tournament.dto';
import { UpdateTournamentDto } from '../../dto/tournament/update-tournament.dto';
import { AllocateMatchDto } from '../../dto/tournament/allocate-match.dto';
import { GenerateCalendarDto } from '../../dto/tournament/generate-calendar.dto';
import { AutoAllocationDto } from '../../dto/tournament/auto-allocation.dto';
import { sendResponse } from '../../../utils/response.util';
import { QueryOptions } from '../../../utils/query.util';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role, SchedulingMode } from '@prisma/client';
import {
  uploadTournamentFiles,
  rollbackTournamentFiles,
  normalizeStringArray,
} from '../../utils/file-upload.util';

@ApiTags('tournament')
@ApiBearerAuth()
@Controller(['tournament', 'tournaments'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class TournamentController {
  constructor(private readonly tournamentService: TournamentService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new Tournament' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'canvasImage', maxCount: 1 },
      { name: 'playerOrgUrl', maxCount: 1 },
      { name: 'prOrgUrl', maxCount: 1 },
      { name: 'tournamentLogoUrl', maxCount: 1 },
      { name: 'tournamentLogo', maxCount: 1 },
      { name: 'rules', maxCount: 10 },
      { name: 'tsAndTc', maxCount: 10 },
    ]),
  )
  async create(
    @Body() createDto: CreateTournamentDto,
    @UploadedFiles()
    files: {
      canvasImage?: Express.Multer.File[];
      playerOrgUrl?: Express.Multer.File[];
      prOrgUrl?: Express.Multer.File[];
      tournamentLogoUrl?: Express.Multer.File[];
      tournamentLogo?: Express.Multer.File[];
      rules?: Express.Multer.File[];
      tsAndTc?: Express.Multer.File[];
    },
  ) {
    const uploadedFiles = await uploadTournamentFiles(files);

    if (uploadedFiles.canvasImage) {
      createDto.canvasImage = uploadedFiles.canvasImage;
    }

    if (uploadedFiles.playerOrgUrl) {
      createDto.playerOrgUrl = uploadedFiles.playerOrgUrl;
    }

    if (uploadedFiles.prOrgUrl) {
      createDto.prOrgUrl = uploadedFiles.prOrgUrl;
    }

    if (uploadedFiles.tournamentLogoUrl) {
      createDto.tournamentLogoUrl = uploadedFiles.tournamentLogoUrl;
    }
    delete (createDto as any).tournamentLogo;

    if (uploadedFiles.rules.length > 0) {
      createDto.rules = uploadedFiles.rules;
    } else {
      createDto.rules = normalizeStringArray(createDto.rules);
    }

    if (uploadedFiles.tsAndTc.length > 0) {
      createDto.tsAndTc = uploadedFiles.tsAndTc;
    } else {
      createDto.tsAndTc = normalizeStringArray(createDto.tsAndTc);
    }

    try {
      const data = await this.tournamentService.createTournament(createDto);
      return sendResponse({
        message: 'Tournament created successfully with canonical structure and schedule',
        data,
      });
    } catch (error) {
      await rollbackTournamentFiles(uploadedFiles);
      throw error;
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get all Tournaments with pagination and search' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'searchTerm', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async findAll(@Query() query: QueryOptions) {
    const { data, meta } =
      await this.tournamentService.getAllTournaments(query);
    return sendResponse({
      message: 'Tournaments retrieved successfully',
      data,
      meta,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a Tournament by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.tournamentService.getTournamentById(id);
    return sendResponse({
      message: 'Tournament retrieved successfully',
      data,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a Tournament with optional files' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'canvasImage', maxCount: 1 },
      { name: 'playerOrgUrl', maxCount: 1 },
      { name: 'prOrgUrl', maxCount: 1 },
      { name: 'tournamentLogoUrl', maxCount: 1 },
      { name: 'tournamentLogo', maxCount: 1 },
      { name: 'rules', maxCount: 10 },
      { name: 'tsAndTc', maxCount: 10 },
    ]),
  )
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateTournamentDto,
    @UploadedFiles()
    files: {
      canvasImage?: Express.Multer.File[];
      playerOrgUrl?: Express.Multer.File[];
      prOrgUrl?: Express.Multer.File[];
      tournamentLogoUrl?: Express.Multer.File[];
      tournamentLogo?: Express.Multer.File[];
      rules?: Express.Multer.File[];
      tsAndTc?: Express.Multer.File[];
    },
  ) {
    const uploadedFiles = await uploadTournamentFiles(files);

    if (uploadedFiles.canvasImage) {
      updateDto.canvasImage = uploadedFiles.canvasImage;
    }

    if (uploadedFiles.playerOrgUrl) {
      updateDto.playerOrgUrl = uploadedFiles.playerOrgUrl;
    }

    if (uploadedFiles.prOrgUrl) {
      updateDto.prOrgUrl = uploadedFiles.prOrgUrl;
    }

    if (uploadedFiles.tournamentLogoUrl) {
      updateDto.tournamentLogoUrl = uploadedFiles.tournamentLogoUrl;
    }
    delete (updateDto as any).tournamentLogo;

    if (uploadedFiles.rules.length > 0) {
      updateDto.rules = uploadedFiles.rules;
    } else if (updateDto.rules !== undefined) {
      updateDto.rules = normalizeStringArray(updateDto.rules);
    }

    if (uploadedFiles.tsAndTc.length > 0) {
      updateDto.tsAndTc = uploadedFiles.tsAndTc;
    } else if (updateDto.tsAndTc !== undefined) {
      updateDto.tsAndTc = normalizeStringArray(updateDto.tsAndTc);
    }

    try {
      const data = await this.tournamentService.updateTournament(id, updateDto);
      return sendResponse({
        message: 'Tournament updated successfully',
        data,
      });
    } catch (error) {
      await rollbackTournamentFiles(uploadedFiles);
      throw error;
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a Tournament by ID' })
  async remove(@Param('id') id: string) {
    const data = await this.tournamentService.deleteTournament(id);
    return sendResponse({
      message: 'Tournament deleted successfully',
      data,
    });
  }

  @Post(':id/schedule')
  @ApiOperation({
    summary:
      'Generate or regenerate full match schedule for a Tournament (e.g. AUTO_HOME_VENUE)',
  })
  async generateSchedule(
    @Param('id') id: string,
    @Body() body?: { schedulingMode?: SchedulingMode; playerIds?: string[] },
  ) {
    const data = await this.tournamentService.generateScheduleForTournament(
      id,
      body?.schedulingMode,
      body?.playerIds,
    );
    return sendResponse({
      message: 'Tournament schedule generated successfully',
      data,
    });
  }

  @Post(':id/calendar')
  @ApiOperation({
    summary:
      'Calendar Generation (POST /tournaments/{id}/calendar): Generate grid of dates, screens, and empty timeslots based on venue screens and hours',
  })
  async generateCalendar(
    @Param('id') id: string,
    @Body() body?: GenerateCalendarDto,
  ) {
    const data = await this.tournamentService.generateCalendarForTournament(
      id,
      body,
    );
    return sendResponse({
      message: 'Tournament calendar generated successfully',
      data,
    });
  }

  @Get(':id/calendar')
  @ApiOperation({ summary: 'Get Tournament calendar grid' })
  async getCalendar(@Param('id') id: string) {
    const data = await this.tournamentService.getTournamentCalendar(id);
    return sendResponse({
      message: 'Tournament calendar retrieved successfully',
      data,
    });
  }

  @Get(':id/schedule')
  @ApiOperation({ summary: 'Get Tournament schedule and joined matches' })
  async getSchedule(@Param('id') id: string) {
    const data = await this.tournamentService.getTournamentCalendar(id);
    return sendResponse({
      message: 'Tournament schedule retrieved successfully',
      data,
    });
  }

  @Get(':id/matches')
  @ApiOperation({ summary: 'Get all canonical matches of a Tournament' })
  async getMatches(@Param('id') id: string) {
    const data = await this.tournamentService.getTournamentMatches(id);
    return sendResponse({
      message: 'Tournament matches retrieved successfully',
      data,
    });
  }

  @Get(':id/capacity')
  @ApiOperation({
    summary:
      'Get Tournament capacity calculations (daily slots, capacity, playing days needed)',
  })
  async getCapacity(@Param('id') id: string) {
    const data = await this.tournamentService.getTournamentCapacity(id);
    return sendResponse({
      message: 'Tournament capacity calculation retrieved successfully',
      data,
    });
  }

  @Post([':id/matches/:matchId/allocate', ':id/matches/:matchId/allocation'])
  @ApiOperation({
    summary:
      'Physical Allocations (POST /tournaments/{id}/matches/{id}/allocate): Link a canonical match ID to a physical slot (venueId, screenId, date, time). Never overwrites scores.',
  })
  async allocateMatch(
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @Body() body: AllocateMatchDto,
  ) {
    const data = await this.tournamentService.allocateTournamentMatch(
      id,
      matchId,
      body,
    );
    return sendResponse({
      message: 'Match allocated to physical slot successfully',
      data,
    });
  }

  @Delete([':id/matches/:matchId/allocate', ':id/matches/:matchId/allocation'])
  @ApiOperation({
    summary:
      'Remove physical allocation of a match, freeing the calendar slot while preserving scores',
  })
  async unallocateMatch(
    @Param('id') id: string,
    @Param('matchId') matchId: string,
  ) {
    const data = await this.tournamentService.unallocateTournamentMatch(
      id,
      matchId,
    );
    return sendResponse({
      message: 'Match unallocated successfully',
      data,
    });
  }

  @Post(':id/auto-allocation')
  @ApiOperation({
    summary:
      'Automatically assign unallocated matches to open slots based on scheduling mode',
  })
  async autoAllocate(
    @Param('id') id: string,
    @Body() body?: AutoAllocationDto,
  ) {
    const data = await this.tournamentService.autoAllocateTournamentMatches(
      id,
      body,
    );
    return sendResponse({
      message: 'Matches auto-allocated successfully',
      data,
    });
  }
}
