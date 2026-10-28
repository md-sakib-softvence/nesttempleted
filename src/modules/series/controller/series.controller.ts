import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
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
  ApiParam,
  ApiResponse,
  ApiConsumes,
  ApiQuery,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { SeriesService } from '../service/series.service';
import { CreateSeriesDto } from '../dto/create-series.dto';
import { UpdateSeriesDto } from '../dto/update-series.dto';
import { UpdateSeriesStatusDto } from '../dto/update-series-status.dto';
import { LinkTournamentsDto } from '../dto/link-tournaments.dto';
import { ReorderTournamentsDto } from '../dto/reorder-tournaments.dto';
import { UpdateSeriesParticipantDto } from '../dto/update-participant.dto';
import { CreateSeriesAdjustmentDto } from '../dto/create-adjustment.dto';
import { UpdateSeriesScoringConfigDto } from '../dto/update-scoring-config.dto';
import { UpdateSeriesPublicationDto } from '../dto/update-publication.dto';
import { QuerySeriesDto } from '../dto/query-series.dto';
import {
  QuerySeriesParticipantDto,
  RecalculateSeriesDto,
} from '../dto/query-participant.dto';
import { sendResponse } from '../../utils/response.util';
import { uploadImageToS3, deleteImageFromS3 } from '../../utils/s3.util';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Role } from '@prisma/client';

@ApiTags('Admin Series Management')
@ApiBearerAuth()
@Controller('series')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List all series for Admin Series Management Dashboard' })
  @ApiResponse({ status: 200, description: 'Series list retrieved successfully' })
  async findAll(@Query() query: QuerySeriesDto) {
    const { items, pagination } = await this.seriesService.getAllSeries(query);
    return sendResponse({
      message: 'Series retrieved successfully',
      data: {
        items,
        pagination,
      },
    });
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Returns complete details of a series' })
  @ApiParam({ name: 'id', description: 'Series ID' })
  @ApiResponse({ status: 200, description: 'Series details retrieved successfully' })
  async findOne(@Param('id') id: string) {
    const data = await this.seriesService.getSeriesById(id);
    return sendResponse({
      message: 'Series details retrieved successfully',
      data,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create a new Series with image uploads' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'logo', maxCount: 1 },
      { name: 'logoUrl', maxCount: 1 },
      { name: 'image', maxCount: 1 },
      { name: 'imageUrl', maxCount: 1 },
    ]),
  )
  @ApiResponse({ status: 201, description: 'Series created successfully' })
  async create(
    @Body() dto: CreateSeriesDto,
    @UploadedFiles()
    files?: {
      logo?: Express.Multer.File[];
      logoUrl?: Express.Multer.File[];
      image?: Express.Multer.File[];
      imageUrl?: Express.Multer.File[];
    },
  ) {
    let uploadedLogo: string | null = null;
    let uploadedImage: string | null = null;

    try {
      const logoFile = files?.logo?.[0] || files?.logoUrl?.[0];
      if (logoFile) {
        uploadedLogo = await uploadImageToS3(logoFile);
        dto.logoUrl = uploadedLogo;
      }

      const imageFile = files?.image?.[0] || files?.imageUrl?.[0];
      if (imageFile) {
        uploadedImage = await uploadImageToS3(imageFile);
        dto.imageUrl = uploadedImage;
      }

      const data = await this.seriesService.createSeries(dto);
      return sendResponse({
        message: 'Series created successfully',
        data,
      });
    } catch (error) {
      if (uploadedLogo) await deleteImageFromS3(uploadedLogo).catch(() => {});
      if (uploadedImage) await deleteImageFromS3(uploadedImage).catch(() => {});
      throw error;
    }
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update editable properties of the Series with optional file uploads' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'logo', maxCount: 1 },
      { name: 'logoUrl', maxCount: 1 },
      { name: 'image', maxCount: 1 },
      { name: 'imageUrl', maxCount: 1 },
    ]),
  )
  @ApiParam({ name: 'id', description: 'Series ID' })
  @ApiResponse({ status: 200, description: 'Series updated successfully' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSeriesDto,
    @UploadedFiles()
    files?: {
      logo?: Express.Multer.File[];
      logoUrl?: Express.Multer.File[];
      image?: Express.Multer.File[];
      imageUrl?: Express.Multer.File[];
    },
  ) {
    let uploadedLogo: string | null = null;
    let uploadedImage: string | null = null;

    try {
      const logoFile = files?.logo?.[0] || files?.logoUrl?.[0];
      if (logoFile) {
        uploadedLogo = await uploadImageToS3(logoFile);
        dto.logoUrl = uploadedLogo;
      }

      const imageFile = files?.image?.[0] || files?.imageUrl?.[0];
      if (imageFile) {
        uploadedImage = await uploadImageToS3(imageFile);
        dto.imageUrl = uploadedImage;
      }

      const data = await this.seriesService.updateSeries(id, dto);
      return sendResponse({
        message: 'Series updated successfully',
        data,
      });
    } catch (error) {
      if (uploadedLogo) await deleteImageFromS3(uploadedLogo).catch(() => {});
      if (uploadedImage) await deleteImageFromS3(uploadedImage).catch(() => {});
      throw error;
    }
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Update series status (DRAFT, UPCOMING, ACTIVE, COMPLETED, ARCHIVED)' })
  @ApiParam({ name: 'id', description: 'Series ID' })
  @ApiResponse({ status: 200, description: 'Series status updated successfully' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSeriesStatusDto,
  ) {
    const data = await this.seriesService.updateSeriesStatus(id, dto);
    return sendResponse({
      message: `Series status updated to ${data.status} successfully`,
      data,
    });
  }

  @Get(':id/tournaments')
  @ApiOperation({ summary: 'Lists all tournaments linked to this series in sequence (with pagination)' })
  @ApiParam({ name: 'id', description: 'Series ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Series tournaments retrieved successfully' })
  async getTournaments(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const data = await this.seriesService.getSeriesTournaments(id, { page, limit });
    return sendResponse({
      message: 'Series tournaments retrieved successfully',
      data,
      meta: (data as any)?.meta || (data as any)?.pagination,
    });
  }

  @Post(':id/tournaments')
  @ApiOperation({ summary: 'Links tournaments to the series' })
  @ApiParam({ name: 'id', description: 'Series ID' })
  @ApiResponse({ status: 200, description: 'Tournaments linked to series successfully' })
  async linkTournaments(
    @Param('id') id: string,
    @Body() dto: LinkTournamentsDto,
  ) {
    const data = await this.seriesService.linkTournaments(seriesIdFrom(id), dto);
    return sendResponse({
      message: 'Tournaments linked to series successfully',
      data,
    });
  }

  @Put(':id/tournaments/reorder')
  @ApiOperation({ summary: 'Reorder the sequence of tournaments within the series' })
  @ApiParam({ name: 'id', description: 'Series ID' })
  @ApiResponse({ status: 200, description: 'Series tournaments reordered successfully' })
  async reorderTournaments(
    @Param('id') id: string,
    @Body() dto: ReorderTournamentsDto,
  ) {
    const data = await this.seriesService.reorderTournaments(seriesIdFrom(id), dto);
    return sendResponse({
      message: 'Series tournaments reordered successfully',
      data,
    });
  }

  @Delete(':id/tournaments/:tournamentId')
  @ApiOperation({ summary: 'Unlinks a tournament from the series and triggers recalculation' })
  @ApiParam({ name: 'id', description: 'Series ID' })
  @ApiParam({ name: 'tournamentId', description: 'Tournament ID to unlink' })
  @ApiResponse({ status: 200, description: 'Tournament unlinked from series successfully' })
  async unlinkTournament(
    @Param('id') id: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    const data = await this.seriesService.unlinkTournament(id, tournamentId);
    return sendResponse({
      message: 'Tournament unlinked from series successfully and standings updated',
      data,
    });
  }

  @Get(':id/participants')
  @ApiOperation({ summary: 'Lists participants enrolled or qualified in this series' })
  @ApiParam({ name: 'id', description: 'Series ID' })
  @ApiResponse({ status: 200, description: 'Series participants retrieved successfully' })
  async getParticipants(
    @Param('id') id: string,
    @Query() query: QuerySeriesParticipantDto,
  ) {
    const { items, pagination } =
      await this.seriesService.getSeriesParticipants(id, query);
    return sendResponse({
      message: 'Series participants retrieved successfully',
      data: {
        items,
        pagination,
      },
    });
  }

  @Patch(':id/participants/:participantId')
  @ApiOperation({ summary: 'Update participant qualification, approval, or status' })
  @ApiParam({ name: 'id', description: 'Series ID' })
  @ApiParam({ name: 'participantId', description: 'Series Participant ID' })
  @ApiResponse({ status: 200, description: 'Participant updated successfully' })
  async updateParticipant(
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body() dto: UpdateSeriesParticipantDto,
  ) {
    const data = await this.seriesService.updateSeriesParticipant(
      id,
      participantId,
      dto,
    );
    return sendResponse({
      message: 'Series participant updated successfully',
      data,
    });
  }

  @Get(':id/leaderboard')
  @Public()
  @ApiOperation({ summary: 'Authoritative series leaderboard from series points engine (with pagination)' })
  @ApiParam({ name: 'id', description: 'Series ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Series leaderboard retrieved successfully' })
  async getLeaderboard(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const data = await this.seriesService.getSeriesLeaderboard(id, { page, limit });
    return sendResponse({
      message: 'Series leaderboard retrieved successfully',
      data,
      meta: (data as any)?.meta || (data as any)?.pagination,
    });
  }

  @Post(':id/recalculate')
  @ApiOperation({ summary: 'Immediate re-aggregation of all series points, positions, bonus rules, and rank movements' })
  @ApiParam({ name: 'id', description: 'Series ID' })
  @ApiResponse({ status: 200, description: 'Series standings recalculated successfully' })
  async recalculate(
    @Param('id') id: string,
    @Body() dto?: RecalculateSeriesDto,
  ) {
    const data = await this.seriesService.recalculateSeriesStandings(
      id,
      dto?.forceAll ?? true,
    );
    return sendResponse({
      message: 'Series standings recalculated successfully',
      data,
    });
  }

  @Post(':id/adjustments')
  @ApiOperation({ summary: 'Applies a manual point adjustment (+/- points) with an administrative reason' })
  @ApiParam({ name: 'id', description: 'Series ID' })
  @ApiResponse({ status: 201, description: 'Point adjustment applied successfully' })
  async createAdjustment(
    @Param('id') id: string,
    @Body() dto: CreateSeriesAdjustmentDto,
  ) {
    const data = await this.seriesService.createPointAdjustment(id, dto);
    return sendResponse({
      message: 'Point adjustment applied successfully',
      data,
    });
  }

  @Get(':id/adjustments')
  @ApiOperation({ summary: 'Lists audit log of all manual point adjustments (with pagination)' })
  @ApiParam({ name: 'id', description: 'Series ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Series point adjustments retrieved successfully' })
  async getAdjustments(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const data = await this.seriesService.getPointAdjustments(id, { page, limit });
    return sendResponse({
      message: 'Series point adjustments retrieved successfully',
      data,
      meta: (data as any)?.meta || (data as any)?.pagination,
    });
  }

  @Get(':id/scoring-config')
  @ApiOperation({ summary: 'Fetches series scoring rules configuration' })
  @ApiParam({ name: 'id', description: 'Series ID' })
  @ApiResponse({ status: 200, description: 'Series scoring configuration retrieved successfully' })
  async getScoringConfig(@Param('id') id: string) {
    const data = await this.seriesService.getScoringConfig(id);
    return sendResponse({
      message: 'Series scoring configuration retrieved successfully',
      data,
    });
  }

  @Put(':id/scoring-config')
  @ApiOperation({ summary: 'Updates placement points, participation points, match outcome points, and tournament multipliers' })
  @ApiParam({ name: 'id', description: 'Series ID' })
  @ApiResponse({ status: 200, description: 'Scoring configuration updated successfully' })
  async updateScoringConfig(
    @Param('id') id: string,
    @Body() dto: UpdateSeriesScoringConfigDto,
  ) {
    const data = await this.seriesService.updateScoringConfig(id, dto);
    return sendResponse({
      message: 'Scoring configuration updated. Standings marked for recalculation.',
      data,
    });
  }

  @Get(':id/publication')
  @ApiOperation({ summary: 'Fetches publication display settings' })
  @ApiParam({ name: 'id', description: 'Series ID' })
  @ApiResponse({ status: 200, description: 'Series publication settings retrieved successfully' })
  async getPublication(@Param('id') id: string) {
    const data = await this.seriesService.getPublicationSettings(id);
    return sendResponse({
      message: 'Series publication settings retrieved successfully',
      data,
    });
  }

  @Put(':id/publication')
  @ApiOperation({ summary: 'Saves display toggles, custom public URL slug, embed preferences, and publish status' })
  @ApiParam({ name: 'id', description: 'Series ID' })
  @ApiResponse({ status: 200, description: 'Series publication settings updated successfully' })
  async updatePublication(
    @Param('id') id: string,
    @Body() dto: UpdateSeriesPublicationDto,
  ) {
    const data = await this.seriesService.updatePublicationSettings(id, dto);
    return sendResponse({
      message: 'Series publication settings updated successfully',
      data,
    });
  }
}

function seriesIdFrom(id: string): string {
  return id;
}
