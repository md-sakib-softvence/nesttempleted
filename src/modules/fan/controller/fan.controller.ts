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
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { FanService } from '../service/fan.service';
import { FanPlayerRegistrationService } from '../service/fan-player-registration.service';
import { CreateFanDto } from '../dto/create-fan.dto';
import { UpdateFanDto } from '../dto/update-fan.dto';
import { CompleteFanTournamentApplicationDto } from '../dto/complete-fan-tournament-application.dto';
import { VerifyFanTournamentPaymentDto } from '../dto/verify-fan-tournament-payment.dto';
import { CreateFanTournamentApplicationDto } from '../dto/create-fan-tournament-application.dto';
import { sendResponse } from '../../utils/response.util';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import {
  uploadImageToS3,
  deleteImageFromS3,
  getPreSignedUrl,
} from '../../utils/s3.util';
import { Role } from '@prisma/client';

@ApiTags('fan')
@ApiBearerAuth()
@Controller('fan')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN, 'fan', Role.FAN, Role.PLAYER, 'player')
export class FanController {
  constructor(
    private readonly fanService: FanService,
    private readonly fanPlayerRegistrationService: FanPlayerRegistrationService,
  ) {}

  @Post('tournaments/:id/registrations')
  @Roles(Role.FAN, 'fan')
  @ApiOperation({
    summary: 'Create a fan tournament application and initialize entry payment',
  })
  async createFanTournamentApplication(
    @Param('id') tournamentId: string,
    @Req() req: Request & { user: { userId: string } },
    @Body() dto: CreateFanTournamentApplicationDto,
  ) {
    const data = await this.fanPlayerRegistrationService.createTournamentApplication(
      req.user.userId,
      tournamentId,
      dto,
    );
    return sendResponse({
      message: data.requiresPayment
        ? 'Tournament application created; payment is pending'
        : 'Payment confirmed; complete your player profile to register',
      data,
    });
  }

  @Get('tournaments/:id/registrations/me')
  @Roles(Role.FAN, 'fan')
  @ApiOperation({ summary: 'Resume the authenticated fan tournament application' })
  async getMyTournamentApplication(
    @Param('id') tournamentId: string,
    @Req() req: Request & { user: { userId: string } },
  ) {
    const data = await this.fanPlayerRegistrationService.getMyTournamentApplication(
      req.user.userId,
      tournamentId,
    );
    return sendResponse({ message: 'Tournament application retrieved', data });
  }

  @Get('tournament-payment-return-context')
  @Roles(Role.FAN, 'fan')
  @ApiOperation({
    summary: 'Find the tournament associated with a returning fan payment',
  })
  @ApiQuery({ name: 'txRef', required: true, type: String })
  async getTournamentForPaymentReturn(
    @Query('txRef') txRef: string,
    @Req() req: Request & { user: { userId: string } },
  ) {
    const data = await this.fanPlayerRegistrationService.getTournamentForPaymentReturn(
      req.user.userId,
      txRef,
    );
    return sendResponse({
      message: 'Tournament payment return context retrieved',
      data,
    });
  }

  @Get('player-gamertag-availability')
  @Roles(Role.FAN, 'fan')
  @ApiOperation({ summary: 'Check whether a player Gamer Tag is available' })
  @ApiQuery({ name: 'gamerTag', required: true, type: String })
  async checkPlayerGamerTagAvailability(@Query('gamerTag') gamerTag: string) {
    const data = await this.fanPlayerRegistrationService.checkGamerTagAvailability(
      gamerTag,
    );
    return sendResponse({ message: 'Gamer Tag availability checked', data });
  }

  @Post('tournaments/:id/registrations/:applicationId/verify-payment')
  @Roles(Role.FAN, 'fan')
  @ApiOperation({
    summary: 'Verify Flutterwave payment for the authenticated fan application',
  })
  async verifyFanTournamentApplicationPayment(
    @Param('id') tournamentId: string,
    @Param('applicationId') applicationId: string,
    @Req() req: Request & { user: { userId: string } },
    @Body() dto: VerifyFanTournamentPaymentDto,
  ) {
    const data = await this.fanPlayerRegistrationService.verifyApplicationPayment(
      req.user.userId,
      tournamentId,
      applicationId,
      dto.txRef,
    );
    return sendResponse({ message: 'Tournament payment verified', data });
  }

  @Post('tournaments/:id/registrations/:applicationId/complete')
  @Roles(Role.FAN, 'fan')
  @ApiOperation({
    summary: 'Create the player account and paid tournament registration after payment',
  })
  async completeFanTournamentApplication(
    @Param('id') tournamentId: string,
    @Param('applicationId') applicationId: string,
    @Req() req: Request & { user: { userId: string } },
    @Body() dto: CompleteFanTournamentApplicationDto,
  ) {
    const data = await this.fanPlayerRegistrationService.completeApplication(
      req.user.userId,
      tournamentId,
      applicationId,
      dto,
    );
    return sendResponse({
      message: 'Player profile created and tournament registration completed',
      data,
    });
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new Fan and award the signup coin bonus' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('profileImage'))
  async registerFan(
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
      const data = await this.fanService.createFan(createFanDto, {
        awardSignupBonus: true,
      });

      if (data.profileImage) {
        data.profileImage = await getPreSignedUrl(data.profileImage);
      }

      return sendResponse({
        message: 'Fan registered successfully. 100 coins have been added.',
        data,
      });
    } catch (error) {
      if (s3ProfileImageFilename) {
        await deleteImageFromS3(s3ProfileImageFilename);
      }
      throw error;
    }
  }

  @Public()
  @Post()
  @ApiOperation({ summary: 'Create Fan' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('profileImage'))
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
  @Roles('fan', Role.FAN)
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
  @ApiQuery({ name: 'marketing', required: false, type: Boolean })
  @ApiQuery({
    name: 'isDeleted',
    required: false,
    type: Boolean,
    description: 'Filter fans by isDeleted status (true/false)',
  })
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
