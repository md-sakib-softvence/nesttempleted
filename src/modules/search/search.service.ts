import { Injectable } from '@nestjs/common';
import { EmployeeRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GlobalSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(rawQuery: string) {
    const query = rawQuery.trim();

    if (query.length < 2) {
      return { players: [], staff: [], tournaments: [] };
    }

    const contains = { contains: query, mode: 'insensitive' as const };
    const employeeSearchConditions: any[] = [
      { name: contains },
      { email: contains },
      { showEmployeeId: contains },
    ];
    const normalizedRole = query.toUpperCase();
    if (Object.values(EmployeeRole).includes(normalizedRole as EmployeeRole)) {
      employeeSearchConditions.push({ role: normalizedRole as EmployeeRole });
    }

    const [players, staff, tournaments] = await Promise.all([
      this.prisma.player.findMany({
        where: {
          isDeleted: false,
          OR: [
            { firstName: contains },
            { lastName: contains },
            { surname: contains },
            { gamerTag: contains },
            { username: contains },
            { email: contains },
          ],
        },
        select: {
          playerId: true,
          showPlayerId: true,
          firstName: true,
          lastName: true,
          gamerTag: true,
          email: true,
          profilePicture: true,
          status: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.employee.findMany({
        where: {
          isDeleted: false,
          OR: employeeSearchConditions,
        },
        select: {
          employeeId: true,
          showEmployeeId: true,
          name: true,
          email: true,
          role: true,
          state: true,
          profileImage: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.tournament.findMany({
        where: {
          isDeleted: false,
          OR: [{ name: contains }, { gameTitle: contains }],
        },
        select: {
          tournamentId: true,
          name: true,
          gameTitle: true,
          gameType: true,
          status: true,
          startDate: true,
          tournamentLogoUrl: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      players: players.map((player) => ({
        id: player.playerId,
        playerId: player.playerId,
        showPlayerId: player.showPlayerId,
        fullName: `${player.firstName} ${player.lastName}`.trim(),
        gamertag: player.gamerTag,
        email: player.email,
        profilePicture: player.profilePicture,
        status: player.status,
        type: 'PLAYER' as const,
      })),
      staff: staff.map((employee) => ({
        id: employee.employeeId,
        employeeId: employee.employeeId,
        showEmployeeId: employee.showEmployeeId,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        status: employee.state,
        profileImage: employee.profileImage,
        type: 'STAFF' as const,
      })),
      tournaments: tournaments.map((tournament) => ({
        id: tournament.tournamentId,
        tournamentId: tournament.tournamentId,
        name: tournament.name,
        gameTitle: tournament.gameTitle,
        gameType: tournament.gameType,
        status: tournament.status,
        startDate: tournament.startDate,
        tournamentLogoUrl: tournament.tournamentLogoUrl,
        type: 'TOURNAMENT' as const,
      })),
    };
  }
}
