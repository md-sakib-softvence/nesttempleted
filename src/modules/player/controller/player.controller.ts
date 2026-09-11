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
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { PlayerService } from '../service/player.service';
import { CreatePlayerDto } from '../dto/create-player.dto';
import { UpdatePlayerDto } from '../dto/update-player.dto';
import { sendResponse } from '../../utils/response.util';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import {
  uploadMultipleFilesToS3,
  deleteImageFromS3,
  getPreSignedUrl,
} from '../../utils/s3.util';
import { Role } from '@prisma/client';

@ApiTags('player')
@ApiBearerAuth()
@Controller('player')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN, 'player')
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @Post()
  @ApiOperation({ summary: 'Create Player' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('documents'))
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async createPlayer(
    @Body() createPlayerDto: CreatePlayerDto,
    @UploadedFiles() documents?: Express.Multer.File[],
  ) {
    let s3DocumentFilenames: string[] = [];

    if (documents && documents.length > 0) {
      s3DocumentFilenames = await uploadMultipleFilesToS3(documents);
      createPlayerDto.documents = s3DocumentFilenames;
    } else {
      createPlayerDto.documents = [];
    }

    try {
      const data = await this.playerService.createPlayer(createPlayerDto);

      if (data.document && data.document.length > 0) {
        data.document = await Promise.all(
          data.document.map(async (doc) => getPreSignedUrl(doc)),
        );
      }

      return sendResponse({ message: 'Player created successfully', data });
    } catch (error) {
      if (s3DocumentFilenames.length > 0) {
        await Promise.all(
          s3DocumentFilenames.map((key) => deleteImageFromS3(key)),
        );
      }
      throw error;
    }
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Player' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('documents'))
  async updatePlayer(
    @Param('id') id: string,
    @Body() updatePlayerDto: UpdatePlayerDto,
    @UploadedFiles() documents?: Express.Multer.File[],
  ) {
    // Convert deletedDocuments to array if it is a string from multipart/form-data
    if (
      updatePlayerDto.deletedDocuments &&
      typeof updatePlayerDto.deletedDocuments === 'string'
    ) {
      updatePlayerDto.deletedDocuments = [updatePlayerDto.deletedDocuments];
    }

    let s3DocumentFilenames: string[] = [];

    if (documents && documents.length > 0) {
      s3DocumentFilenames = await uploadMultipleFilesToS3(documents);
      updatePlayerDto.documents = s3DocumentFilenames;
    } else {
      delete updatePlayerDto.documents;
    }

    try {
      const data = await this.playerService.updatePlayer(id, updatePlayerDto);

      if (data.document && data.document.length > 0) {
        data.document = await Promise.all(
          data.document.map(async (doc) => getPreSignedUrl(doc)),
        );
      }

      return sendResponse({ message: 'Player updated successfully', data });
    } catch (error) {
      if (s3DocumentFilenames.length > 0) {
        await Promise.all(
          s3DocumentFilenames.map((key) => deleteImageFromS3(key)),
        );
      }
      throw error;
    }
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

  @Get('profile')
  @ApiOperation({ summary: 'Get logged in Player' })
  @Roles('player')
  async getLoginPlayer(@Req() req: Request & { user: { userId: string } }) {
    const playerId = req.user.userId;
    const data = await this.playerService.getPlayerById(playerId);
    return sendResponse<any>({
      message: 'Player profile retrieved successfully',
      data,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific Player by ID' })
  async getPlayerById(@Param('id') id: string) {
    const data = await this.playerService.getPlayerById(id);
    return sendResponse({
      message: 'Player retrieved successfully',
      data,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Get all Players' })
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
  @ApiOperation({ summary: 'Soft delete Player' })
  async deletePlayer(@Param('id') id: string) {
    const data = await this.playerService.deletePlayer(id);
    return sendResponse({ message: 'Player deleted successfully', data });
  }
}
