import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ManageEventPrizeService } from '../../service/manage-event-prize.service';
import { CreateManageEventPrizeDto } from '../../dto/manage-event-prize/create-manage-event-prize.dto';
import { UpdateManageEventPrizeDto } from '../../dto/manage-event-prize/update-manage-event-prize.dto';
import { sendResponse } from '../../../utils/response.util';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('tournament/manage-event-prize')
@ApiBearerAuth()
@Controller('tournament/manage-event-prize')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class ManageEventPrizeController {
  constructor(
    private readonly manageEventPrizeService: ManageEventPrizeService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new event prize' })
  async create(@Body() createDto: CreateManageEventPrizeDto) {
    const data = await this.manageEventPrizeService.create(createDto);
    return sendResponse({
      message: 'Event prize created successfully',
      data,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single event prize by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.manageEventPrizeService.findOne(id);
    return sendResponse({
      message: 'Event prize retrieved successfully',
      data,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an event prize by ID' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateManageEventPrizeDto,
  ) {
    const data = await this.manageEventPrizeService.update(id, updateDto);
    return sendResponse({
      message: 'Event prize updated successfully',
      data,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an event prize by ID' })
  async remove(@Param('id') id: string) {
    const data = await this.manageEventPrizeService.remove(id);
    return sendResponse({
      message: 'Event prize deleted successfully',
      data,
    });
  }
}
