import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { SystemService } from './system.service';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '@prisma/client';

@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('config')
  getConfig() {
    return this.systemService.getConfig();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @Patch('config')
  updateConfig(@Body() updateSystemConfigDto: UpdateSystemConfigDto) {
    return this.systemService.updateConfig(updateSystemConfigDto);
  }
}
