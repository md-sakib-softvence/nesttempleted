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
import { sendResponse } from '../../../utils/response.util';
import { QueryOptions } from '../../../utils/query.util';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role, SchedulingMode } from '@prisma/client';
import {
  uploadTournamentFiles,
  rollbackTournamentFiles,
} from '../../utils/file-upload.util';

@ApiTags('tournament')
@ApiBearerAuth()
@Controller('tournament')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class TournamentController {
  constructor(private readonly tournamentService: TournamentService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new Tournament with images and documents',
  })
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
    } else if (!createDto.rules) {
      createDto.rules = [];
    }

    if (uploadedFiles.tsAndTc.length > 0) {
      createDto.tsAndTc = uploadedFiles.tsAndTc;
    } else if (!createDto.tsAndTc) {
      createDto.tsAndTc = [];
    }

    try {
      const data = await this.tournamentService.createTournament(createDto);
      return sendResponse({
        message: 'Tournament created successfully',
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
    }

    if (uploadedFiles.tsAndTc.length > 0) {
      updateDto.tsAndTc = uploadedFiles.tsAndTc;
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
}

