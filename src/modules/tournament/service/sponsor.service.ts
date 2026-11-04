import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSponsorDto } from '../dto/sponsor/create-sponsor.dto';
import { UpdateSponsorDto } from '../dto/sponsor/update-sponsor.dto';
import {
  safePresignUrl,
  extractStorageKey,
} from '../utils/tournament-media.util';

@Injectable()
export class SponsorService {
  constructor(private readonly prisma: PrismaService) {}

  private async presignSponsor<T extends Record<string, any>>(
    sponsor: T,
  ): Promise<T> {
    if (!sponsor) return sponsor;
    const formatted: Record<string, any> = { ...sponsor };
    if (formatted.logo) {
      formatted.logo = await safePresignUrl(String(formatted.logo));
      formatted.logoUrl = formatted.logo;
    }
    return formatted as T;
  }

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

    if (dto.logo) {
      dto.logo = extractStorageKey(dto.logo);
    }

    const created = await this.prisma.sponsor.create({
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
    return this.presignSponsor(created);
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

    return this.presignSponsor(sponsor);
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

    if (dto.logo) {
      dto.logo = extractStorageKey(dto.logo);
    }

    const updated = await this.prisma.sponsor.update({
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
    return this.presignSponsor(updated);
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
