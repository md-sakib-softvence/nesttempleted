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
import { ApiTags, ApiOperation, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { PlayerService } from '../service/player.service';
import { CreatePlayerDto } from '../dto/create-player.dto';
import { UpdatePlayerDto } from '../dto/update-player.dto';
import { sendResponse } from '../../utils/response.util';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { uploadMultipleFilesToS3 } from '../../utils/s3.util';
import { Role } from '@prisma/client';

@ApiTags('player')
@Controller('player')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN, 'player' as Role)
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
    if (documents && documents.length > 0) {
      const s3Urls = await uploadMultipleFilesToS3(documents);
      createPlayerDto.documents = s3Urls;
    } else {
      createPlayerDto.documents = [];
    }
    const data = await this.playerService.createPlayer(createPlayerDto);
    return sendResponse({ message: 'Player created successfully', data });
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
    if (documents && documents.length > 0) {
      const s3Urls = await uploadMultipleFilesToS3(documents);
      updatePlayerDto.documents = s3Urls;
    }
    const data = await this.playerService.updatePlayer(id, updatePlayerDto);
    return sendResponse({ message: 'Player updated successfully', data });
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get logged in Player' })
  @Roles('player' as Role)
  async getLoginPlayer(@Req() req: Request & { user: { userId: string } }) {
    const playerId = req.user.userId;
    const data = await this.playerService.getPlayerById(playerId);
    return sendResponse<any>({
      message: 'Player profile retrieved successfully',
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
