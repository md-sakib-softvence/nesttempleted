import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Notification')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new notification' })
  @ApiResponse({
    status: 201,
    description: 'The notification has been successfully created.',
  })
  create(@Body() createNotificationDto: CreateNotificationDto) {
    return this.notificationService.create(createNotificationDto);
  }

  @Get('me')
  @Roles(
    Role.FAN,
    'fan',
    Role.PLAYER,
    'player',
    Role.EMPLOYEE,
    Role.MANAGER,
    Role.AMBASSADOR,
    'SECURITY',
  )
  @ApiOperation({ summary: 'Get notifications for the authenticated fan' })
  @ApiResponse({ status: 200, description: 'Return the fan notifications.' })
  findMine(@Req() req: Request & { user: { userId: string } }) {
    return this.notificationService.findForUser(req.user.userId);
  }

  @Patch('me/read-all')
  @Roles(
    Role.FAN,
    'fan',
    Role.PLAYER,
    'player',
    Role.EMPLOYEE,
    Role.MANAGER,
    Role.AMBASSADOR,
    'SECURITY',
  )
  @ApiOperation({ summary: 'Mark all notifications for the authenticated fan as read' })
  @ApiResponse({ status: 200, description: 'All unread fan notifications were marked as read.' })
  markAllMineAsRead(@Req() req: Request & { user: { userId: string } }) {
    return this.notificationService.markAllAsReadForUser(req.user.userId);
  }

  @Patch(':id/read')
  @Roles(
    Role.FAN,
    'fan',
    Role.PLAYER,
    'player',
    Role.EMPLOYEE,
    Role.MANAGER,
    Role.AMBASSADOR,
    'SECURITY',
  )
  @ApiOperation({ summary: 'Mark one notification for the authenticated fan as read' })
  @ApiResponse({ status: 200, description: 'The fan notification was marked as read.' })
  markMineAsRead(
    @Param('id') id: string,
    @Req() req: Request & { user: { userId: string } },
  ) {
    return this.notificationService.markAsReadForUser(id, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all notifications' })
  @ApiResponse({ status: 200, description: 'Return all notifications.' })
  findAll() {
    return this.notificationService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a notification by id' })
  @ApiResponse({ status: 200, description: 'Return the notification.' })
  findOne(@Param('id') id: string) {
    return this.notificationService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a notification' })
  @ApiResponse({
    status: 200,
    description: 'The notification has been successfully updated.',
  })
  update(
    @Param('id') id: string,
    @Body() updateNotificationDto: UpdateNotificationDto,
  ) {
    return this.notificationService.update(id, updateNotificationDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  @ApiResponse({
    status: 200,
    description: 'The notification has been successfully deleted.',
  })
  remove(@Param('id') id: string) {
    return this.notificationService.remove(id);
  }
}
