import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateManageEventPrizeDto } from '../dto/manage-event-prize/create-manage-event-prize.dto';
import { UpdateManageEventPrizeDto } from '../dto/manage-event-prize/update-manage-event-prize.dto';

@Injectable()
export class ManageEventPrizeService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateManageEventPrizeDto) {
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

    return this.prisma.manageEventPrize.create({
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

  async findOne(id: string) {
    const eventPrize = await this.prisma.manageEventPrize.findUnique({
      where: { manageEventPrizeId: id },
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

    if (!eventPrize) {
      throw new NotFoundException(`Event prize with ID ${id} not found`);
    }

    return eventPrize;
  }

  async update(id: string, dto: UpdateManageEventPrizeDto) {
    const existing = await this.prisma.manageEventPrize.findUnique({
      where: { manageEventPrizeId: id },
    });

    if (!existing) {
      throw new NotFoundException(`Event prize with ID ${id} not found`);
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

    return this.prisma.manageEventPrize.update({
      where: { manageEventPrizeId: id },
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
    const existing = await this.prisma.manageEventPrize.findUnique({
      where: { manageEventPrizeId: id },
    });

    if (!existing) {
      throw new NotFoundException(`Event prize with ID ${id} not found`);
    }

    return this.prisma.manageEventPrize.delete({
      where: { manageEventPrizeId: id },
    });
  }
}
