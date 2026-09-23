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
import { ManageEventCostService } from '../../service/manage-event-cost.service';
import { CreateManageEventCostDto } from '../../dto/manage-event-cost/create-manage-event-cost.dto';
import { UpdateManageEventCostDto } from '../../dto/manage-event-cost/update-manage-event-cost.dto';
import { sendResponse } from '../../../utils/response.util';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('tournament/manage-event-cost')
@ApiBearerAuth()
@Controller('tournament/manage-event-cost')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class ManageEventCostController {
  constructor(
    private readonly manageEventCostService: ManageEventCostService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new event cost' })
  async create(@Body() createDto: CreateManageEventCostDto) {
    const data = await this.manageEventCostService.create(createDto);
    return sendResponse({
      message: 'Event cost created successfully',
      data,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single event cost by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.manageEventCostService.findOne(id);
    return sendResponse({
      message: 'Event cost retrieved successfully',
      data,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an event cost by ID' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateManageEventCostDto,
  ) {
    const data = await this.manageEventCostService.update(id, updateDto);
    return sendResponse({
      message: 'Event cost updated successfully',
      data,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an event cost by ID' })
  async remove(@Param('id') id: string) {
    const data = await this.manageEventCostService.remove(id);
    return sendResponse({
      message: 'Event cost deleted successfully',
      data,
    });
  }
}
