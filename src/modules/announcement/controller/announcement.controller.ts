import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AnnouncementService } from '../service/announcement.service';
import { CreateAnnouncementDto } from '../dto/create-announcement.dto';
import { UpdateAnnouncementDto } from '../dto/update-announcement.dto';
import { CreateAnnouncementTemplateDto } from '../dto/create-announcement-template.dto';
import { UpdateAnnouncementTemplateDto } from '../dto/update-announcement-template.dto';
import { sendResponse } from '../../utils/response.util';
import { QueryOptions } from '../../utils/query.util';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('announcement')
@ApiBearerAuth()
@Controller('announcement')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @Post()
  @ApiOperation({ summary: 'Create / broadcast a new Announcement' })
  async create(@Body() createAnnouncementDto: CreateAnnouncementDto) {
    const data = await this.announcementService.create(createAnnouncementDto);
    return sendResponse({
      message: 'Announcement broadcast created successfully',
      data,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Get all Announcements with pagination, search, and filters' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'searchTerm', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'audience', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['SENT', 'DRAFT'] })
  async findAll(@Query() query: QueryOptions) {
    const { data, meta } = await this.announcementService.findAll(query);
    return sendResponse({
      message: 'Announcements retrieved successfully',
      data,
      meta,
    });
  }

  // --- Automated Notification Templates ---

  @Get('template')
  @ApiOperation({ summary: 'Get all automated announcement/notification templates' })
  async getAllTemplates() {
    const data = await this.announcementService.getAllTemplates();
    return sendResponse({
      message: 'Announcement templates retrieved successfully',
      data,
    });
  }

  @Post('template')
  @ApiOperation({ summary: 'Create a new announcement/notification template' })
  async createTemplate(@Body() createDto: CreateAnnouncementTemplateDto) {
    const data = await this.announcementService.createTemplate(createDto);
    return sendResponse({
      message: 'Announcement template created successfully',
      data,
    });
  }

  @Get('template/:id')
  @ApiOperation({ summary: 'Get an announcement template by ID or key' })
  async getTemplate(@Param('id') id: string) {
    const data = await this.announcementService.getTemplateById(id);
    return sendResponse({
      message: 'Announcement template retrieved successfully',
      data,
    });
  }

  @Patch('template/:id')
  @ApiOperation({ summary: 'Update an announcement template message / text' })
  async updateTemplate(
    @Param('id') id: string,
    @Body() updateDto: UpdateAnnouncementTemplateDto,
  ) {
    const data = await this.announcementService.updateTemplate(id, updateDto);
    return sendResponse({
      message: 'Announcement template updated successfully',
      data,
    });
  }

  @Post('template/:id/reset')
  @ApiOperation({ summary: 'Reset an announcement template to its default message' })
  async resetTemplate(@Param('id') id: string) {
    const data = await this.announcementService.resetTemplate(id);
    return sendResponse({
      message: 'Announcement template reset to default successfully',
      data,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an Announcement by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.announcementService.findOne(id);
    return sendResponse({
      message: 'Announcement retrieved successfully',
      data,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an Announcement by ID' })
  async update(
    @Param('id') id: string,
    @Body() updateAnnouncementDto: UpdateAnnouncementDto,
  ) {
    const data = await this.announcementService.update(id, updateAnnouncementDto);
    return sendResponse({
      message: 'Announcement updated successfully',
      data,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete an Announcement by ID' })
  async remove(@Param('id') id: string) {
    const data = await this.announcementService.remove(id);
    return sendResponse({
      message: 'Announcement deleted successfully',
      data,
    });
  }
}
