import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateManageEventCostDto } from '../dto/manage-event-cost/create-manage-event-cost.dto';
import { UpdateManageEventCostDto } from '../dto/manage-event-cost/update-manage-event-cost.dto';
import {
  buildPrismaQuery,
  calculatePaginationMeta,
  QueryOptions,
} from '../../utils/query.util';

@Injectable()
export class ManageEventCostService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateManageEventCostDto) {
    if (dto.tournamentId) {
      const tournament = await this.prisma.tournament.findUnique({
        where: { tournamentId: dto.tournamentId },
      });

      if (!tournament || tournament.isDeleted) {
        throw new NotFoundException(
          `Tournament with ID ${dto.tournamentId} not found`,
        );
      }
    }

    return this.prisma.manageEventCost.create({
      data: dto,
      include: {
        tournament: {
          select: {
            tournamentId: true,
            name: true,
            gameTitle: true,
          },
        },
      },
    });
  }

  async findAll(query: QueryOptions) {
    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      ['costCategory'],
    );

    const [data, total] = await Promise.all([
      this.prisma.manageEventCost.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          tournament: {
            select: {
              tournamentId: true,
              name: true,
              gameTitle: true,
            },
          },
        },
      }),
      this.prisma.manageEventCost.count({ where }),
    ]);

    const meta = calculatePaginationMeta(total, page, limit);

    return { data, meta };
  }

  async findOne(id: string) {
    const eventCost = await this.prisma.manageEventCost.findUnique({
      where: { manageEventCostId: id },
      include: {
        tournament: {
          select: {
            tournamentId: true,
            name: true,
            gameTitle: true,
          },
        },
      },
    });

    if (!eventCost) {
      throw new NotFoundException(`Event cost with ID ${id} not found`);
    }

    return eventCost;
  }

  async update(id: string, dto: UpdateManageEventCostDto) {
    const existing = await this.prisma.manageEventCost.findUnique({
      where: { manageEventCostId: id },
    });

    if (!existing) {
      throw new NotFoundException(`Event cost with ID ${id} not found`);
    }

    if (dto.tournamentId) {
      const tournament = await this.prisma.tournament.findUnique({
        where: { tournamentId: dto.tournamentId },
      });

      if (!tournament || tournament.isDeleted) {
        throw new NotFoundException(
          `Tournament with ID ${dto.tournamentId} not found`,
        );
      }
    }

    return this.prisma.manageEventCost.update({
      where: { manageEventCostId: id },
      data: dto,
      include: {
        tournament: {
          select: {
            tournamentId: true,
            name: true,
            gameTitle: true,
          },
        },
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.manageEventCost.findUnique({
      where: { manageEventCostId: id },
    });

    if (!existing) {
      throw new NotFoundException(`Event cost with ID ${id} not found`);
    }

    return this.prisma.manageEventCost.delete({
      where: { manageEventCostId: id },
    });
  }
}
