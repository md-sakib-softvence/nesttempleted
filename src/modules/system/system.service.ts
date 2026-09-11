import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';

@Injectable()
export class SystemService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig() {
    const config = await this.prisma.systemConfig.findFirst();
    if (!config) {
      throw new NotFoundException('System configuration not found');
    }
    return config;
  }

  async updateConfig(dto: UpdateSystemConfigDto) {
    const config = await this.prisma.systemConfig.findFirst();
    if (!config) {
      throw new NotFoundException('System configuration not found');
    }

    return this.prisma.systemConfig.update({
      where: { id: config.id },
      data: dto,
    });
  }
}
