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
import { VenueService } from '../../service/venue.service';
import { CreateVenueDto } from '../../dto/venue/create-venue.dto';
import { UpdateVenueDto } from '../../dto/venue/update-venue.dto';
import { sendResponse } from '../../../utils/response.util';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('tournament/venue')
@ApiBearerAuth()
@Controller('tournament/venue')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class VenueController {
  constructor(private readonly venueService: VenueService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new venue' })
  async create(@Body() createDto: CreateVenueDto) {
    const data = await this.venueService.create(createDto);
    return sendResponse({
      message: 'Venue created successfully',
      data,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single venue by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.venueService.findOne(id);
    return sendResponse({
      message: 'Venue retrieved successfully',
      data,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a venue by ID' })
  async update(@Param('id') id: string, @Body() updateDto: UpdateVenueDto) {
    const data = await this.venueService.update(id, updateDto);
    return sendResponse({
      message: 'Venue updated successfully',
      data,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a venue by ID' })
  async remove(@Param('id') id: string) {
    const data = await this.venueService.remove(id);
    return sendResponse({
      message: 'Venue deleted successfully',
      data,
    });
  }
}
