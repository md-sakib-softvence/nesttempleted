import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { PlayerService } from '../service/player.service';
import { AuthService } from '../../auth/service/auth.service';
import { CreatePlayerDto } from '../dto/create-player.dto';
import { UpdatePlayerDto } from '../dto/update-player.dto';
import { UpdateDocumentStatusDto } from '../dto/update-document-status.dto';
import { ModeratePlayerPhotoDto } from '../dto/moderate-player-photo.dto';
import { ModeratePlayerGamerTagDto } from '../dto/moderate-player-gamertag.dto';
import { UpdatePlayerDisciplineDto } from '../dto/update-player-discipline.dto';
import { ChangePasswordDto } from '../../auth/dto/change-password.dto';
import { sendResponse } from '../../utils/response.util';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import {
  uploadImageToS3,
  uploadMultipleFilesToS3,
  deleteImageFromS3,
} from '../../utils/s3.util';
import { Role } from '@prisma/client';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email: string;
    role: string;
  };
}

@ApiTags('player')
@ApiBearerAuth()
@Controller('player')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  Role.ADMIN,
  Role.SUPER_ADMIN,
  'player',
  'admin',
  'super_admin',
  Role.PLAYER,
)
export class PlayerController {
  constructor(
    private readonly playerService: PlayerService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Helper to normalize multipart/form-data deletedDocuments string or array.
   */
  private normalizeDeletedDocuments(dto: UpdatePlayerDto) {
    if (
      dto.deletedDocuments &&
      typeof (dto.deletedDocuments as unknown) === 'string'
    ) {
      const rawString = dto.deletedDocuments as unknown as string;
      try {
        const parsed = JSON.parse(rawString);
        dto.deletedDocuments = Array.isArray(parsed)
          ? parsed
          : [String(parsed)];
      } catch {
        dto.deletedDocuments = [rawString];
      }
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create Player (Admin only)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'profilePicture', maxCount: 1 },
      { name: 'documents', maxCount: 10 },
    ]),
  )
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
  async createPlayer(
    @Body() createPlayerDto: CreatePlayerDto,
    @UploadedFiles()
    files?: {
      profilePicture?: Express.Multer.File[];
      documents?: Express.Multer.File[];
    },
  ) {
    let uploadedProfilePictureKey: string | undefined = undefined;
    let uploadedDocumentKeys: string[] = [];

    try {
      if (files?.profilePicture?.[0]) {
        uploadedProfilePictureKey = await uploadImageToS3(
          files.profilePicture[0],
        );
      }
      if (files?.documents && files.documents.length > 0) {
        uploadedDocumentKeys = await uploadMultipleFilesToS3(files.documents);
      }

      const data = await this.playerService.createPlayer(
        createPlayerDto,
        uploadedProfilePictureKey,
        uploadedDocumentKeys,
      );

      return sendResponse({ message: 'Player created successfully', data });
    } catch (error) {
      // Clean up orphaned S3 uploads on database failure
      if (uploadedProfilePictureKey) {
        void deleteImageFromS3(uploadedProfilePictureKey);
      }
      if (uploadedDocumentKeys.length > 0) {
        void Promise.all(uploadedDocumentKeys.map((k) => deleteImageFromS3(k)));
      }
      throw error;
    }
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get logged in Player Profile & Settings' })
  @Roles('player', Role.PLAYER)
  async getLoginPlayer(@Req() req: RequestWithUser) {
    const playerId = req.user.userId;
    const data = await this.playerService.getPlayerById(playerId);
    return sendResponse({
      message: 'Player profile retrieved successfully',
      data,
    });
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'Get Unified Competitor Dashboard Hub Overview',
    description:
      'Returns complete portal data for Competitor Dashboard: profile, compliance status, next scheduled showdown, registered cups, performance records, and raffles.',
  })
  @Roles('player', Role.PLAYER)
  async getPlayerDashboard(@Req() req: RequestWithUser) {
    const playerId = req.user.userId;
    const data = await this.playerService.getPlayerDashboard(playerId);
    return sendResponse({
      message: 'Competitor dashboard retrieved successfully',
      data,
    });
  }

  @Get('matches')
  @ApiOperation({
    summary:
      'Get all Competitor Matches categorized into upcoming, unscheduled, and completed (with optional pagination)',
  })
  @ApiQuery({ name: 'tournamentId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @Roles('player', Role.PLAYER)
  async getPlayerMatches(
    @Req() req: RequestWithUser,
    @Query('tournamentId') tournamentId?: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const playerId = req.user.userId;
    const data = await this.playerService.getPlayerMatches(playerId, {
      tournamentId,
      status,
      page,
      limit,
    });
    return sendResponse({
      message: 'Competitor matches retrieved successfully',
      data,
      meta: (data as any)?.meta || (data as any)?.pagination,
    });
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update logged in Player Profile & Settings' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'profilePicture', maxCount: 1 },
      { name: 'documents', maxCount: 10 },
    ]),
  )
  @Roles('player', Role.PLAYER)
  async updateLoggedInPlayer(
    @Req() req: RequestWithUser,
    @Body() updatePlayerDto: UpdatePlayerDto,
    @UploadedFiles()
    files?: {
      profilePicture?: Express.Multer.File[];
      documents?: Express.Multer.File[];
    },
  ) {
    const playerId = req.user.userId;
    this.normalizeDeletedDocuments(updatePlayerDto);

    let uploadedProfilePictureKey: string | undefined = undefined;
    let uploadedDocumentKeys: string[] = [];

    try {
      if (files?.profilePicture?.[0]) {
        uploadedProfilePictureKey = await uploadImageToS3(
          files.profilePicture[0],
        );
      }
      if (files?.documents && files.documents.length > 0) {
        uploadedDocumentKeys = await uploadMultipleFilesToS3(files.documents);
      }

      const data = await this.playerService.updatePlayer(
        playerId,
        updatePlayerDto,
        uploadedProfilePictureKey,
        uploadedDocumentKeys,
        req.user,
      );

      return sendResponse({
        message: 'Player profile and settings updated successfully',
        data,
      });
    } catch (error) {
      if (uploadedProfilePictureKey) {
        void deleteImageFromS3(uploadedProfilePictureKey);
      }
      if (uploadedDocumentKeys.length > 0) {
        void Promise.all(uploadedDocumentKeys.map((k) => deleteImageFromS3(k)));
      }
      throw error;
    }
  }

  @Post('change-password')
  @ApiOperation({
    summary: 'Change Player Password (Dedicated Security Endpoint)',
  })
  @Roles('player', Role.PLAYER)
  async changePassword(
    @Req() req: RequestWithUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    const data = await this.authService.changePassword(
      req.user,
      changePasswordDto,
    );
    return sendResponse({
      message: 'Password changed successfully',
      data,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Player by ID (Self or Admin)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'profilePicture', maxCount: 1 },
      { name: 'documents', maxCount: 10 },
    ]),
  )
  async updatePlayer(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
    @Body() updatePlayerDto: UpdatePlayerDto,
    @UploadedFiles()
    files?: {
      profilePicture?: Express.Multer.File[];
      documents?: Express.Multer.File[];
    },
  ) {
    this.normalizeDeletedDocuments(updatePlayerDto);

    let uploadedProfilePictureKey: string | undefined = undefined;
    let uploadedDocumentKeys: string[] = [];

    try {
      if (files?.profilePicture?.[0]) {
        uploadedProfilePictureKey = await uploadImageToS3(
          files.profilePicture[0],
        );
      }
      if (files?.documents && files.documents.length > 0) {
        uploadedDocumentKeys = await uploadMultipleFilesToS3(files.documents);
      }

      const data = await this.playerService.updatePlayer(
        id,
        updatePlayerDto,
        uploadedProfilePictureKey,
        uploadedDocumentKeys,
        req.user,
      );

      return sendResponse({
        message: 'Player updated successfully',
        data,
      });
    } catch (error) {
      if (uploadedProfilePictureKey) {
        void deleteImageFromS3(uploadedProfilePictureKey);
      }
      if (uploadedDocumentKeys.length > 0) {
        void Promise.all(uploadedDocumentKeys.map((k) => deleteImageFromS3(k)));
      }
      throw error;
    }
  }

  @Patch(':playerId/documents/:documentId/status')
  @ApiOperation({ summary: 'Verify or Reject Player Document (Admin only)' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
  async updateDocumentStatus(
    @Param('playerId') playerId: string,
    @Param('documentId') documentId: string,
    @Body() dto: UpdateDocumentStatusDto,
  ) {
    const data = await this.playerService.updateDocumentStatus(
      playerId,
      documentId,
      dto,
    );
    return sendResponse({
      message: `Document status successfully updated to ${dto.status}`,
      data,
    });
  }

  @Patch(':playerId/moderation/photo')
  @ApiOperation({ summary: 'Approve or reject a player profile photo (Admin only)' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
  async moderatePlayerPhoto(
    @Param('playerId') playerId: string,
    @Req() req: RequestWithUser,
    @Body() dto: ModeratePlayerPhotoDto,
  ) {
    const data = await this.playerService.moderatePhoto(
      playerId,
      dto.status,
      dto.notes,
      req.user.userId,
    );
    return sendResponse({
      message: `Profile photo status updated to ${dto.status}`,
      data,
    });
  }

  @Patch(':playerId/moderation/gamertag')
  @ApiOperation({ summary: 'Approve or flag a player gamer tag (Admin only)' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
  async moderatePlayerGamerTag(
    @Param('playerId') playerId: string,
    @Req() req: RequestWithUser,
    @Body() dto: ModeratePlayerGamerTagDto,
  ) {
    const data = await this.playerService.moderateGamerTag(
      playerId,
      dto.status,
      dto.notes,
      req.user.userId,
    );
    return sendResponse({
      message: `Gamer tag status updated to ${dto.status}`,
      data,
    });
  }

  @Patch(':playerId/discipline')
  @ApiOperation({ summary: 'Update player status and private discipline notes (Admin only)' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
  async updatePlayerDiscipline(
    @Param('playerId') playerId: string,
    @Req() req: RequestWithUser,
    @Body() dto: UpdatePlayerDisciplineDto,
  ) {
    const data = await this.playerService.updateDiscipline(
      playerId,
      dto,
      req.user.userId,
    );
    return sendResponse({
      message: 'Player discipline information updated successfully',
      data,
    });
  }

  @Get(':playerId/discipline')
  @ApiOperation({ summary: 'Get private player discipline information (Admin only)' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
  async getPlayerDiscipline(@Param('playerId') playerId: string) {
    const data = await this.playerService.getDiscipline(playerId);
    return sendResponse({
      message: 'Player discipline information retrieved successfully',
      data,
    });
  }

  @Get(':playerId/financials')
  @ApiOperation({ summary: 'Get admin financial summary and ledger for a player' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
  async getAdminPlayerFinancials(
    @Param('playerId') playerId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.playerService.getAdminFinancials(playerId, {
      page,
      limit,
    });
    return sendResponse({
      message: 'Player financials retrieved successfully',
      data,
      meta: data.pagination,
    });
  }

  @Get(':playerId/security/passes')
  @ApiOperation({ summary: 'Get a player’s tournament passes and QR codes' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
  async getAdminPlayerSecurityPasses(
    @Param('playerId') playerId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.playerService.getAdminSecurityPasses(playerId, {
      page,
      limit,
    });
    return sendResponse({
      message: 'Player security passes retrieved successfully',
      data,
      meta: data.pagination,
    });
  }

  @Get(':playerId/security/access-logs')
  @ApiOperation({ summary: 'Get match check-in access logs for a player' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
  async getAdminPlayerAccessLogs(
    @Param('playerId') playerId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.playerService.getAdminAccessLogs(playerId, {
      page,
      limit,
    });
    return sendResponse({
      message: 'Player access logs retrieved successfully',
      data,
      meta: data.pagination,
    });
  }

  @Post(':playerId/security/qr-codes/regenerate')
  @ApiOperation({ summary: 'Regenerate all tournament QR codes for a player' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
  async regenerateAdminPlayerQrCodes(@Param('playerId') playerId: string) {
    const data = await this.playerService.regenerateAdminPlayerQrCodes(playerId);
    return sendResponse({
      message: 'Player tournament QR codes regenerated successfully',
      data,
    });
  }

  @Delete(':playerId/documents/:documentId')
  @ApiOperation({
    summary: 'Delete a specific Player Document (Self or Admin)',
  })
  async deleteDocument(
    @Param('playerId') playerId: string,
    @Param('documentId') documentId: string,
    @Req() req: RequestWithUser,
  ) {
    const isSelf = req.user.userId === playerId;
    const isAdmin =
      req.user.role === Role.ADMIN ||
      req.user.role === Role.SUPER_ADMIN ||
      req.user.role === 'admin' ||
      req.user.role === 'super_admin';

    if (!isSelf && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to delete this document.',
      );
    }

    const data = await this.playerService.deleteDocument(playerId, documentId);
    return sendResponse({
      message: 'Document deleted successfully',
      data,
    });
  }

  @Get('recover')
  @Public()
  @ApiOperation({ summary: 'Recover deactivated Player account' })
  async recoverPlayer(@Query('token') token: string) {
    const data = await this.playerService.recoverPlayer(token);
    return sendResponse({
      message: 'Player account recovered successfully',
      data,
    });
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a specific Player by ID' })
  async getPlayerById(@Param('id') id: string) {
    const data = await this.playerService.getPlayerById(id);
    return sendResponse({
      message: 'Player retrieved successfully',
      data,
    });
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all Players (Paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'searchTerm', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async getAllPlayer(@Query() query: any) {
    const { data, meta } = await this.playerService.getAllPlayer(query);
    return sendResponse({
      message: 'Players retrieved successfully',
      data,
      meta,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete Player account (Admin only)' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'admin', 'super_admin')
  async deletePlayer(@Param('id') id: string) {
    const data = await this.playerService.deletePlayer(id);
    return sendResponse({ message: 'Player deleted successfully', data });
  }
}
