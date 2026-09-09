import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CreateFanDto } from '../dto/create-fan.dto';
import { UpdateFanDto } from '../dto/update-fan.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import {
  buildPrismaQuery,
  calculatePaginationMeta,
  QueryOptions,
} from '../../utils/query.util';

@Injectable()
export class FanService {
  constructor(private prisma: PrismaService) {}

  async createFan(createFanDto: CreateFanDto) {
    const existingFan = await this.prisma.fan.findUnique({
      where: { email: createFanDto.email },
    });

    if (existingFan) {
      if (existingFan.isDeleted) {
        throw new ConflictException('This account has been deactivated.');
      }
      throw new ConflictException('Fan with this email already exists');
    }

    const existingShowId = await this.prisma.fan.findUnique({
      where: { showFanId: createFanDto.showFanId },
    });

    if (existingShowId) {
      throw new ConflictException('Fan with this Show ID already exists');
    }

    const { password, ...rest } = createFanDto;
    const hashedPassword = await bcrypt.hash(password, 10);

    return this.prisma.fan.create({
      data: {
        ...rest,
        password: hashedPassword,
      },
    });
  }

  async updateFan(id: string, updateFanDto: UpdateFanDto) {
    const existingFan = await this.prisma.fan.findUnique({
      where: { fanId: id },
    });

    if (!existingFan) {
      throw new NotFoundException('Fan not found');
    }

    if (updateFanDto.email && updateFanDto.email !== existingFan.email) {
      const emailTaken = await this.prisma.fan.findUnique({
        where: { email: updateFanDto.email },
      });
      if (emailTaken) {
        throw new ConflictException('Email is already in use');
      }
    }

    const { password, ...restData } = updateFanDto;
    let hashedPassword: string | undefined = undefined;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    return this.prisma.fan.update({
      where: { fanId: id },
      data: {
        ...restData,
        ...(hashedPassword ? { password: hashedPassword } : {}),
      },
    });
  }

  async getFanById(id: string) {
    if (!id) {
      throw new NotFoundException('Fan ID is required');
    }

    const fan = await this.prisma.fan.findUnique({
      where: { fanId: id },
    });

    if (!fan || fan.isDeleted) {
      throw new NotFoundException('Fan not found');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...fanWithoutPassword } = fan;
    return fanWithoutPassword;
  }

  async getAllFan(query: QueryOptions = {}) {
    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      ['firstName', 'email', 'showFanId', 'phoneNumber'],
    );

    where.isDeleted = false;

    const [data, total] = await Promise.all([
      this.prisma.fan.findMany({
        where,
        skip,
        take,
        orderBy,
      }),
      this.prisma.fan.count({ where }),
    ]);

    const meta = calculatePaginationMeta(total, page, limit);

    return { data, meta };
  }

  async deleteFan(id: string) {
    const fan = await this.prisma.fan.findUnique({
      where: { fanId: id },
    });

    if (!fan) {
      throw new NotFoundException('Fan not found');
    }

    return this.prisma.fan.update({
      where: { fanId: id },
      data: {
        isDeleted: true,
      },
    });
  }
}
