import { Body, Controller, Post, Get, Patch, Delete, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { MarketingDataService } from '../service/marketing-data.service';
import { CreateMarketingDataDto } from '../dto/create-marketing-data.dto';
import { UpdateMarketingDataDto } from '../dto/update-marketing-data.dto';
import { sendResponse } from '../../utils/response.util';
import { QueryOptions } from '../../utils/query.util';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminRole, EmployeeRole } from '@prisma/client';

@ApiTags('marketing-data')
@ApiBearerAuth()
@Controller('marketing-data')
export class MarketingDataController {
  constructor(private readonly marketingDataService: MarketingDataService) {}

  @Post()
  @Public()
  @ApiOperation({
    summary:
      'Submit marketing form (Simultaneously registers Fan or Player)',
  })
  async createMarketingData(@Body() createDto: CreateMarketingDataDto) {
    const data = await this.marketingDataService.createMarketingData(createDto);
    return sendResponse({
      message: 'Marketing data and user profile created successfully',
      data,
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, EmployeeRole.EMPLOYEE as any)
  @ApiOperation({ summary: 'Get all marketing data' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'searchTerm', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async getAllMarketingData(@Query() query: QueryOptions) {
    const { data, meta } = await this.marketingDataService.getAllMarketingData(query);
    return sendResponse({
      message: 'Marketing data retrieved successfully',
      data,
      meta,
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, EmployeeRole.EMPLOYEE as any)
  @ApiOperation({ summary: 'Get a specific marketing data entry' })
  async getMarketingDataById(@Param('id') id: string) {
    const data = await this.marketingDataService.getMarketingDataById(id);
    return sendResponse({
      message: 'Marketing data retrieved successfully',
      data,
    });
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, EmployeeRole.EMPLOYEE as any)
  @ApiOperation({ summary: 'Update a specific marketing data entry' })
  async updateMarketingData(
    @Param('id') id: string,
    @Body() updateDto: UpdateMarketingDataDto,
  ) {
    const data = await this.marketingDataService.updateMarketingData(id, updateDto);
    return sendResponse({
      message: 'Marketing data updated successfully',
      data,
    });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, EmployeeRole.EMPLOYEE as any)
  @ApiOperation({ summary: 'Soft delete a specific marketing data entry' })
  async deleteMarketingData(@Param('id') id: string) {
    const data = await this.marketingDataService.deleteMarketingData(id);
    return sendResponse({
      message: 'Marketing data deleted successfully',
      data,
    });
  }
}
