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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MarketingDataService } from '../service/marketing-data.service';
import { CreateMarketingDataDto } from '../dto/create-marketing-data.dto';
import { UpdateMarketingDataDto } from '../dto/update-marketing-data.dto';
import { sendResponse } from '../../utils/response.util';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('marketing-data')
@Controller('marketing-data')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MarketingDataController {
  constructor(private readonly marketingDataService: MarketingDataService) {}

  @Post()
  @ApiOperation({ summary: 'Create Marketing Data' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'fan' as Role, 'player' as Role)
  async createMarketingData(@Body() createMarketingDataDto: CreateMarketingDataDto) {
    const data = await this.marketingDataService.createMarketingData(createMarketingDataDto);
    return sendResponse({ message: 'Marketing data created successfully', data });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Marketing Data' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'fan' as Role, 'player' as Role)
  async updateMarketingData(
    @Param('id') id: string,
    @Body() updateMarketingDataDto: UpdateMarketingDataDto,
  ) {
    const data = await this.marketingDataService.updateMarketingData(id, updateMarketingDataDto);
    return sendResponse({ message: 'Marketing data updated successfully', data });
  }

  @Get()
  @ApiOperation({ summary: 'Get all Marketing Data' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'searchTerm', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async getAllMarketingData(@Query() query: any) {
    const { data, meta } = await this.marketingDataService.getAllMarketingData(query);
    return sendResponse({
      message: 'Marketing data retrieved successfully',
      data,
      meta,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Marketing Data by ID' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, 'fan' as Role, 'player' as Role)
  async getMarketingDataById(@Param('id') id: string) {
    const data = await this.marketingDataService.getMarketingDataById(id);
    return sendResponse({
      message: 'Marketing data retrieved successfully',
      data,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete Marketing Data' })
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async deleteMarketingData(@Param('id') id: string) {
    const data = await this.marketingDataService.deleteMarketingData(id);
    return sendResponse({ message: 'Marketing data deleted successfully', data });
  }
}
