import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { CreateMarketingDataDto } from '../dto/create-marketing-data.dto';
import { UpdateMarketingDataDto } from '../dto/update-marketing-data.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  buildPrismaQuery,
  calculatePaginationMeta,
  QueryOptions,
} from '../../utils/query.util';

@Injectable()
export class MarketingDataService {
  constructor(private prisma: PrismaService) {}

  async createMarketingData(createMarketingDataDto: CreateMarketingDataDto) {
    if (createMarketingDataDto.fanId) {
      const existing = await this.prisma.marketingDataCollection.findUnique({
        where: { fanId: createMarketingDataDto.fanId },
      });
      if (existing) {
        throw new ConflictException('Marketing data for this Fan already exists');
      }
    }

    if (createMarketingDataDto.playerId) {
      const existing = await this.prisma.marketingDataCollection.findUnique({
        where: { playerId: createMarketingDataDto.playerId },
      });
      if (existing) {
        throw new ConflictException('Marketing data for this Player already exists');
      }
    }

    return this.prisma.marketingDataCollection.create({
      data: createMarketingDataDto,
    });
  }

  async updateMarketingData(id: string, updateMarketingDataDto: UpdateMarketingDataDto) {
    const existing = await this.prisma.marketingDataCollection.findUnique({
      where: { marketingDataCollectionId: id },
    });

    if (!existing) {
      throw new NotFoundException('Marketing Data not found');
    }

    return this.prisma.marketingDataCollection.update({
      where: { marketingDataCollectionId: id },
      data: updateMarketingDataDto,
    });
  }

  async getMarketingDataById(id: string) {
    if (!id) {
      throw new NotFoundException('ID is required');
    }

    const data = await this.prisma.marketingDataCollection.findUnique({
      where: { marketingDataCollectionId: id },
    });

    if (!data || data.isDeleted) {
      throw new NotFoundException('Marketing Data not found');
    }

    return data;
  }

  async getAllMarketingData(query: QueryOptions = {}) {
    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      ['gamerTag', 'parentName', 'occupation', 'area'],
    );

    where.isDeleted = false;

    const [data, total] = await Promise.all([
      this.prisma.marketingDataCollection.findMany({
        where,
        skip,
        take,
        orderBy,
      }),
      this.prisma.marketingDataCollection.count({ where }),
    ]);

    const meta = calculatePaginationMeta(total, page, limit);

    return { data, meta };
  }

  async deleteMarketingData(id: string) {
    const data = await this.prisma.marketingDataCollection.findUnique({
      where: { marketingDataCollectionId: id },
    });

    if (!data) {
      throw new NotFoundException('Marketing Data not found');
    }

    return this.prisma.marketingDataCollection.update({
      where: { marketingDataCollectionId: id },
      data: {
        isDeleted: true,
      },
    });
  }
}
