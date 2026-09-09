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
import { ApiTags, ApiOperation, ApiConsumes, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { FanService } from '../service/fan.service';
import { CreateFanDto } from '../dto/create-fan.dto';
import { UpdateFanDto } from '../dto/update-fan.dto';
import { sendResponse } from '../../utils/response.util';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { uploadImageToS3, deleteImageFromS3, getPreSignedUrl } from '../../utils/s3.util';
import { Role } from '@prisma/client';

@ApiTags('fan')
@ApiBearerAuth()
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
    let s3ProfileImageFilename: string | null = null;
    
    if (profileImage) {
      s3ProfileImageFilename = await uploadImageToS3(profileImage);
      createFanDto.profileImage = s3ProfileImageFilename;
    } else {
      delete createFanDto.profileImage;
    }

    try {
      const data = await this.fanService.createFan(createFanDto);
      
      if (data.profileImage) {
        data.profileImage = await getPreSignedUrl(data.profileImage);
      }
      
      return sendResponse({ message: 'Fan created successfully', data });
    } catch (error) {
      if (s3ProfileImageFilename) {
        await deleteImageFromS3(s3ProfileImageFilename);
      }
      throw error;
    }
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
    let s3ProfileImageFilename: string | null = null;

    if (profileImage) {
      s3ProfileImageFilename = await uploadImageToS3(profileImage);
      updateFanDto.profileImage = s3ProfileImageFilename;
    } else {
      delete updateFanDto.profileImage;
    }

    try {
      const data = await this.fanService.updateFan(id, updateFanDto);
      
      if (data.profileImage) {
        data.profileImage = await getPreSignedUrl(data.profileImage);
      }
      
      return sendResponse({ message: 'Fan updated successfully', data });
    } catch (error) {
      if (s3ProfileImageFilename) {
        await deleteImageFromS3(s3ProfileImageFilename);
      }
      throw error;
    }
  }

  @Get('recover')
  @Public()
  @ApiOperation({ summary: 'Recover deactivated Fan account' })
  async recoverFan(@Query('token') token: string) {
    const data = await this.fanService.recoverFan(token);
    return sendResponse({
      message: 'Fan account recovered successfully',
      data,
    });
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

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific Fan by ID' })
  async getFanById(@Param('id') id: string) {
    const data = await this.fanService.getFanById(id);
    return sendResponse({
      message: 'Fan retrieved successfully',
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
