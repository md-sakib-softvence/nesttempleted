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
  UploadedFiles,
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
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { EmployeeService } from '../service/employee.service';
import { CreateEmployeeDto } from '../dto/create-employee.dto';
import { UpdateEmployeeDto } from '../dto/update-employee.dto';
import { sendResponse } from '../../utils/response.util';
import { QueryOptions } from '../../utils/query.util';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminRole, EmployeeRole } from '@prisma/client';
import { getPreSignedUrl } from '../../utils/s3.util';
import {
  uploadEmployeeFiles,
  rollbackEmployeeFiles,
} from '../utils/file-upload.util';

@ApiTags('employee')
@ApiBearerAuth()
@Controller('employee')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Post()
  @ApiOperation({ summary: 'Create Employee' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'profileImage', maxCount: 1 },
      {
        name: 'document',
        maxCount: parseInt(process.env.MAX_DOCUMENTS || '10', 10),
      },
    ]),
  )
  @Roles(AdminRole.SUPER_ADMIN)
  async createEmployee(
    @Body() createEmployeeDto: CreateEmployeeDto,
    @UploadedFiles()
    files: {
      profileImage?: Express.Multer.File[];
      document?: Express.Multer.File[];
    },
  ) {
    const uploadedFiles = await uploadEmployeeFiles(files);

    if (uploadedFiles.profileImage) {
      createEmployeeDto.profileImage = uploadedFiles.profileImage;
    } else {
      delete createEmployeeDto.profileImage;
    }

    if (uploadedFiles.document.length > 0) {
      createEmployeeDto.document = uploadedFiles.document;
    } else {
      createEmployeeDto.document = [];
    }

    try {
      const data = await this.employeeService.createEmployee(createEmployeeDto);

      if (data.profileImage) {
        data.profileImage = await getPreSignedUrl(data.profileImage);
      }

      if (data.document && data.document.length > 0) {
        data.document = await Promise.all(
          data.document.map(async (doc) => getPreSignedUrl(doc)),
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...safeData } = data as any;

      return sendResponse({
        message: 'Employee created successfully',
        data: safeData,
      });
    } catch (error) {
      await rollbackEmployeeFiles(
        uploadedFiles.profileImage,
        uploadedFiles.document,
      );
      throw error;
    }
  }

  @Public()
  @Get('recover')
  @ApiOperation({ summary: 'Recover deactivated Employee account' })
  async recoverEmployee(@Query('token') token: string) {
    const data = await this.employeeService.recoverEmployee(token);
    return sendResponse({
      message: 'Employee account recovered successfully',
      data,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Employee' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'profileImage', maxCount: 1 },
      {
        name: 'document',
        maxCount: parseInt(process.env.MAX_DOCUMENTS || '10', 10),
      },
    ]),
  )
  async updateEmployee(
    @Param('id') id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
    @UploadedFiles()
    files: {
      profileImage?: Express.Multer.File[];
      document?: Express.Multer.File[];
    },
  ) {
    if (
      updateEmployeeDto.deletedDocuments &&
      typeof updateEmployeeDto.deletedDocuments === 'string'
    ) {
      updateEmployeeDto.deletedDocuments = [updateEmployeeDto.deletedDocuments];
    }

    const uploadedFiles = await uploadEmployeeFiles(files);

    if (uploadedFiles.profileImage) {
      updateEmployeeDto.profileImage = uploadedFiles.profileImage;
    } else {
      delete updateEmployeeDto.profileImage;
    }

    if (uploadedFiles.document.length > 0) {
      updateEmployeeDto.document = uploadedFiles.document;
    } else {
      delete updateEmployeeDto.document;
    }

    try {
      const data = await this.employeeService.updateEmployee(
        id,
        updateEmployeeDto,
      );

      if (data.profileImage) {
        data.profileImage = await getPreSignedUrl(data.profileImage);
      }

      if (data.document && data.document.length > 0) {
        data.document = await Promise.all(
          data.document.map(async (doc) => getPreSignedUrl(doc)),
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...safeData } = data as any;

      return sendResponse({
        message: 'Employee updated successfully',
        data: safeData,
      });
    } catch (error) {
      await rollbackEmployeeFiles(
        uploadedFiles.profileImage,
        uploadedFiles.document,
      );
      throw error;
    }
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'Get all documents for a specific Employee' })
  async getEmployeeDocuments(@Param('id') id: string) {
    const data = await this.employeeService.getEmployeeDocuments(id);
    return sendResponse({
      message: 'Employee documents retrieved successfully',
      data,
    });
  }

  @Get(':id/marketing-data')
  @Roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, EmployeeRole.EMPLOYEE)
  @ApiOperation({
    summary: 'Get all marketing data collected by a specific Employee',
  })
  async getEmployeeMarketingData(@Param('id') id: string) {
    const data = await this.employeeService.getEmployeeMarketingData(id);
    return sendResponse({
      message: 'Employee marketing data retrieved successfully',
      data,
    });
  }

  @Get('profile')
  @Roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, ...Object.values(EmployeeRole))
  @ApiOperation({ summary: 'Get logged in Employee' })
  async getLoginEmployee(@Req() req: Request & { user: { userId: string } }) {
    const employeeId = req.user.userId;
    const data = await this.employeeService.getEmployeeById(employeeId);
    return sendResponse({
      message: 'Employee profile retrieved successfully',
      data,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific Employee by ID' })
  async getEmployeeById(@Param('id') id: string) {
    const data = await this.employeeService.getEmployeeById(id);
    return sendResponse({
      message: 'Employee retrieved successfully',
      data,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Get all Employees' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'searchTerm', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async getAllEmployee(@Query() query: QueryOptions) {
    const { data, meta } = await this.employeeService.getAllEmployee(query);
    return sendResponse({
      message: 'Employees retrieved successfully',
      data,
      meta,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete Employee' })
  async deleteEmployee(@Param('id') id: string) {
    const data = await this.employeeService.deleteEmployee(id);
    return sendResponse({ message: 'Employee deleted successfully', data });
  }
}
