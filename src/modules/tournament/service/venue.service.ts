import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateVenueDto } from '../dto/venue/create-venue.dto';
import { UpdateVenueDto } from '../dto/venue/update-venue.dto';

@Injectable()
export class VenueService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateVenueDto) {
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

    const { screens, ...venueData } = dto;

    return this.prisma.venue.create({
      data: {
        ...venueData,
        ...(screens &&
          screens.length > 0 && {
            screens: {
              create: screens.map((screenName) => ({ screenName })),
            },
          }),
      },
      include: {
        screens: true,
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
    const venue = await this.prisma.venue.findUnique({
      where: { venueId: id },
      include: {
        screens: true,
        tournament: {
          select: {
            tournamentId: true,
            name: true,
            gameTitle: true,
          },
        },
      },
    });

    if (!venue) {
      throw new NotFoundException(`Venue with ID ${id} not found`);
    }

    return venue;
  }

  async update(id: string, dto: UpdateVenueDto) {
    const existing = await this.prisma.venue.findUnique({
      where: { venueId: id },
    });

    if (!existing) {
      throw new NotFoundException(`Venue with ID ${id} not found`);
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

    const { screens, ...venueData } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (screens !== undefined) {
        await tx.screen.deleteMany({
          where: { venueId: id },
        });

        if (screens.length > 0) {
          await tx.screen.createMany({
            data: screens.map((screenName) => ({
              venueId: id,
              screenName,
            })),
          });
        }
      }

      return tx.venue.update({
        where: { venueId: id },
        data: venueData,
        include: {
          screens: true,
          tournament: {
            select: {
              tournamentId: true,
              name: true,
              gameTitle: true,
            },
          },
        },
      });
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.venue.findUnique({
      where: { venueId: id },
    });

    if (!existing) {
      throw new NotFoundException(`Venue with ID ${id} not found`);
    }

    return this.prisma.venue.delete({
      where: { venueId: id },
    });
  }
}
