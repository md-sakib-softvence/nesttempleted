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
import { EmployeeService } from '../service/employee.service';
import { CreateEmployeeDto } from '../dto/create-employee.dto';
import { UpdateEmployeeDto } from '../dto/update-employee.dto';
import { sendResponse } from '../../utils/response.util';
import { QueryOptions } from '../../utils/query.util';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminRole } from '@prisma/client';
import { uploadImageToS3 } from '../../utils/s3.util';

@ApiTags('employee')
@Controller('employee')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Post()
  @ApiOperation({ summary: 'Create Employee' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('profileImage'))
  @Roles(AdminRole.SUPER_ADMIN)
  async createEmployee(
    @Body() createEmployeeDto: CreateEmployeeDto,
    @UploadedFile() profileImage?: Express.Multer.File,
  ) {
    if (profileImage) {
      const s3Url = await uploadImageToS3(profileImage);
      createEmployeeDto.profileImage = s3Url;
    }
    const data = await this.employeeService.createEmployee(createEmployeeDto);
    return sendResponse({ message: 'Employee created successfully', data });
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
  @UseInterceptors(FileInterceptor('profileImage'))
  async updateEmployee(
    @Param('id') id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
    @UploadedFile() profileImage?: Express.Multer.File,
  ) {
    if (profileImage) {
      const s3Url = await uploadImageToS3(profileImage);
      updateEmployeeDto.profileImage = s3Url;
    }
    const data = await this.employeeService.updateEmployee(
      id,
      updateEmployeeDto,
    );
    return sendResponse({ message: 'Employee updated successfully', data });
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get logged in Employee' })
  async getLoginEmployee(@Req() req: Request & { user: { userId: string } }) {
    const employeeId = req.user.userId;
    const data = await this.employeeService.getEmployeeById(employeeId);
    return sendResponse({
      message: 'Employee profile retrieved successfully',
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
