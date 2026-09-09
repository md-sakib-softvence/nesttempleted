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
  UploadedFile,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { FanService } from '../service/fan.service';
import { CreateFanDto } from '../dto/create-fan.dto';
import { UpdateFanDto } from '../dto/update-fan.dto';
import { sendResponse } from '../../utils/response.util';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { uploadImageToS3 } from '../../utils/s3.util';
import { Role } from '@prisma/client';

@ApiTags('fan')
@Controller('fan')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN, 'fan' as Role)
export class FanController {
  constructor(private readonly fanService: FanService) {}

  @Post()
  @ApiOperation({ summary: 'Create Fan' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('profileImage'))
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async createFan(
    @Body() createFanDto: CreateFanDto,
    @UploadedFile() profileImage?: Express.Multer.File,
  ) {
    if (profileImage) {
      const s3Url = await uploadImageToS3(profileImage);
      createFanDto.profileImage = s3Url;
    }
    const data = await this.fanService.createFan(createFanDto);
    return sendResponse({ message: 'Fan created successfully', data });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Fan' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('profileImage'))
  async updateFan(
    @Param('id') id: string,
    @Body() updateFanDto: UpdateFanDto,
    @UploadedFile() profileImage?: Express.Multer.File,
  ) {
    if (profileImage) {
      const s3Url = await uploadImageToS3(profileImage);
      updateFanDto.profileImage = s3Url;
    }
    const data = await this.fanService.updateFan(id, updateFanDto);
    return sendResponse({ message: 'Fan updated successfully', data });
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get logged in Fan' })
  @Roles('fan' as Role)
  async getLoginFan(@Req() req: Request & { user: { userId: string } }) {
    const fanId = req.user.userId;
    const data = await this.fanService.getFanById(fanId);
    return sendResponse<any>({
      message: 'Fan profile retrieved successfully',
      data,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Get all Fans' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'searchTerm', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async getAllFan(@Query() query: any) {
    const { data, meta } = await this.fanService.getAllFan(query);
    return sendResponse({
      message: 'Fans retrieved successfully',
      data,
      meta,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete Fan' })
  async deleteFan(@Param('id') id: string) {
    const data = await this.fanService.deleteFan(id);
    return sendResponse({ message: 'Fan deleted successfully', data });
  }
}
