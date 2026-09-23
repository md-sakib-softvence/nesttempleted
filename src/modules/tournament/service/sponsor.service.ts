import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSponsorDto } from '../dto/sponsor/create-sponsor.dto';
import { UpdateSponsorDto } from '../dto/sponsor/update-sponsor.dto';

@Injectable()
export class SponsorService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSponsorDto) {
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

    return this.prisma.sponsor.create({
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
    const sponsor = await this.prisma.sponsor.findUnique({
      where: { sponsorId: id },
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

    if (!sponsor) {
      throw new NotFoundException(`Sponsor with ID ${id} not found`);
    }

    return sponsor;
  }

  async update(id: string, dto: UpdateSponsorDto) {
    const existing = await this.prisma.sponsor.findUnique({
      where: { sponsorId: id },
    });

    if (!existing) {
      throw new NotFoundException(`Sponsor with ID ${id} not found`);
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

    return this.prisma.sponsor.update({
      where: { sponsorId: id },
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
    const existing = await this.prisma.sponsor.findUnique({
      where: { sponsorId: id },
    });

    if (!existing) {
      throw new NotFoundException(`Sponsor with ID ${id} not found`);
    }

    return this.prisma.sponsor.delete({
      where: { sponsorId: id },
    });
  }
}
