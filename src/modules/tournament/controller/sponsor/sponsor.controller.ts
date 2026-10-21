import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { SponsorService } from '../../service/sponsor.service';
import { CreateSponsorDto } from '../../dto/sponsor/create-sponsor.dto';
import { UpdateSponsorDto } from '../../dto/sponsor/update-sponsor.dto';
import { sendResponse } from '../../../utils/response.util';
import { uploadImageToS3 } from '../../../utils/s3.util';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../common/guards/roles.guard';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('tournament/sponsor')
@ApiBearerAuth()
@Controller('tournament/sponsor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class SponsorController {
  constructor(private readonly sponsorService: SponsorService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new sponsor with logo upload' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('logo'))
  async create(
    @Body() createDto: CreateSponsorDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) {
      createDto.logo = await uploadImageToS3(file);
    }
    const data = await this.sponsorService.create(createDto);
    return sendResponse({
      message: 'Sponsor created successfully',
      data,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single sponsor by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.sponsorService.findOne(id);
    return sendResponse({
      message: 'Sponsor retrieved successfully',
      data,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a sponsor by ID with optional logo upload' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('logo'))
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateSponsorDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) {
      updateDto.logo = await uploadImageToS3(file);
    }
    const data = await this.sponsorService.update(id, updateDto);
    return sendResponse({
      message: 'Sponsor updated successfully',
      data,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a sponsor by ID' })
  async remove(@Param('id') id: string) {
    const data = await this.sponsorService.remove(id);
    return sendResponse({
      message: 'Sponsor deleted successfully',
      data,
    });
  }
}
