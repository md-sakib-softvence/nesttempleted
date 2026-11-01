import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, TournamentGuidelineSection } from '@prisma/client';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Public } from '../../../../common/decorators/public.decorator';
import { sendResponse } from '../../../utils/response.util';
import {
  CreateTournamentGuidelineDto,
  UpdateTournamentGuidelineDto,
} from '../../dto/guideline/guideline.dto';
import { TournamentGuidelineService } from '../../service/tournament-guideline.service';

@ApiTags('tournament-guidelines')
@ApiBearerAuth()
@Controller('tournaments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TournamentGuidelineController {
  constructor(private readonly guidelineService: TournamentGuidelineService) {}

  @Public()
  @Get(':id/guidelines')
  @ApiOperation({ summary: 'List published tournament rules, terms, and policies' })
  async list(@Param('id') id: string) {
    return sendResponse({
      message: 'Tournament guidelines retrieved successfully',
      data: await this.guidelineService.list(id),
    });
  }

  @Get(':id/guidelines/admin')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all tournament guidelines, including unpublished items' })
  async listAdmin(@Param('id') id: string) {
    return sendResponse({
      message: 'All tournament guidelines retrieved successfully',
      data: await this.guidelineService.list(id, true),
    });
  }

  @Public()
  @Get(':id/guidelines/:section')
  @ApiOperation({ summary: 'List published guidelines for one section' })
  async listSection(
    @Param('id') id: string,
    @Param('section') section: TournamentGuidelineSection,
  ) {
    if (!Object.values(TournamentGuidelineSection).includes(section)) {
      throw new BadRequestException('Invalid guideline section');
    }
    return sendResponse({
      message: 'Tournament guidelines retrieved successfully',
      data: await this.guidelineService.getBySection(id, section),
    });
  }

  @Post(':id/guidelines')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Create a tournament rule, term, policy, link, or document' })
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @Param('id') id: string,
    @Body() dto: CreateTournamentGuidelineDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return sendResponse({
      message: 'Tournament guideline created successfully',
      data: await this.guidelineService.create(id, dto, file),
    });
  }

  @Patch(':id/guidelines/:guidelineId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Update a tournament guideline' })
  @UseInterceptors(FileInterceptor('file'))
  async update(
    @Param('id') id: string,
    @Param('guidelineId') guidelineId: string,
    @Body() dto: UpdateTournamentGuidelineDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return sendResponse({
      message: 'Tournament guideline updated successfully',
      data: await this.guidelineService.update(id, guidelineId, dto, file),
    });
  }

  @Delete(':id/guidelines/:guidelineId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a tournament guideline' })
  async remove(
    @Param('id') id: string,
    @Param('guidelineId') guidelineId: string,
  ) {
    return sendResponse({
      message: 'Tournament guideline deleted successfully',
      data: await this.guidelineService.remove(id, guidelineId),
    });
  }
}
