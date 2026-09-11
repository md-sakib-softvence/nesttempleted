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
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
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
import {
  uploadImageToS3,
  deleteImageFromS3,
  getPreSignedUrl,
} from '../../utils/s3.util';

@ApiTags('admin')
@ApiBearerAuth()
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
    let s3Filename: string | null = null;
    if (profileImage) {
      try {
        s3Filename = await uploadImageToS3(profileImage);
        createAdminDto.profileImage = s3Filename;
      } catch (error) {
        throw new BadRequestException(
          'Image upload failed. Please verify your AWS S3 bucket configuration.',
        );
      }
    }

    try {
      const data = await this.adminService.createAdmin(createAdminDto);

      // Presign the image in the response immediately so frontend can view it
      if (data.profileImage) {
        data.profileImage = await getPreSignedUrl(data.profileImage);
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...safeData } = data;

      return sendResponse({
        message: 'Admin created successfully',
        data: safeData,
      });
    } catch (error) {
      // If DB creation fails (e.g. duplicate email), rollback the uploaded S3 image
      if (s3Filename) {
        await deleteImageFromS3(s3Filename);
      }
      throw error;
    }
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
    let s3Filename: string | null = null;
    if (profileImage) {
      try {
        s3Filename = await uploadImageToS3(profileImage);
        updateAdminDto.profileImage = s3Filename;
      } catch (error) {
        console.error(error);
        throw new BadRequestException(
          'Image upload failed. Please verify your AWS S3 bucket configuration.',
        );
      }
    }

    try {
      const data = await this.adminService.updateAdmin(id, updateAdminDto);

      // Presign the image in the response immediately so frontend can view it
      if (data.profileImage) {
        data.profileImage = await getPreSignedUrl(data.profileImage);
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...safeData } = data;

      return sendResponse({
        message: 'Admin updated successfully',
        data: safeData,
      });
    } catch (error) {
      // If DB update fails, rollback the newly uploaded S3 image
      if (s3Filename) {
        await deleteImageFromS3(s3Filename);
      }
      throw error;
    }
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

  @Get(':id')
  @ApiOperation({ summary: 'Get Admin by ID' })
  async getAdminById(@Param('id') id: string) {
    const data = await this.adminService.getAdminById(id);
    return sendResponse({
      message: 'Admin retrieved successfully',
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
