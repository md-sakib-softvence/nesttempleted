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
import { AdminService } from '../service/admin.service';
import { CreateAdminDto } from '../dto/create-admin.dto';
import { UpdateAdminDto } from '../dto/update-admin.dto';
import { sendResponse } from '../../utils/response.util';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminRole } from '@prisma/client';
import { uploadImageToS3 } from '../../utils/s3.util';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post()
  @ApiOperation({ summary: 'Create Admin' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('profileImage'))
  @Roles(AdminRole.SUPER_ADMIN)
  async createAdmin(
    @Body() createAdminDto: CreateAdminDto,
    @UploadedFile() profileImage?: Express.Multer.File,
  ) {
    if (profileImage) {
      const s3Url = await uploadImageToS3(profileImage);
      createAdminDto.profileImage = s3Url;
    }
    const data = await this.adminService.createAdmin(createAdminDto);
    return sendResponse({ message: 'Admin created successfully', data });
  }

  @Public()
  @Get('recover')
  @ApiOperation({ summary: 'Recover deactivated Admin account' })
  async recoverAdmin(@Query('token') token: string) {
    const data = await this.adminService.recoverAdmin(token);
    return sendResponse({
      message: 'Admin account recovered successfully',
      data,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Admin' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('profileImage'))
  async updateAdmin(
    @Param('id') id: string,
    @Body() updateAdminDto: UpdateAdminDto,
    @UploadedFile() profileImage?: Express.Multer.File,
  ) {
    if (profileImage) {
      const s3Url = await uploadImageToS3(profileImage);
      updateAdminDto.profileImage = s3Url;
    }
    const data = await this.adminService.updateAdmin(id, updateAdminDto);
    return sendResponse({ message: 'Admin updated successfully', data });
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get logged in Admin' })
  async getLoginAdmin(@Req() req: Request & { user: { userId: string } }) {
    const adminId = req.user.userId;
    const data = await this.adminService.getAdminById(adminId);
    return sendResponse({
      message: 'Admin profile retrieved successfully',
      data,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Get all Admins' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'searchTerm', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async getAllAdmin(@Query() query: any) {
    const { data, meta } = await this.adminService.getAllAdmin(query);
    return sendResponse({
      message: 'Admins retrieved successfully',
      data,
      meta,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete Admin' })
  async deleteAdmin(@Param('id') id: string) {
    const data = await this.adminService.deleteAdmin(id);
    return sendResponse({ message: 'Admin deleted successfully', data });
  }
}
