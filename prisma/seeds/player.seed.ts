import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export async function seedPlayers(prisma: PrismaClient) {
  console.log('⚽ Seeding players...');

  const defaultPassword = 'Password123!';
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  const playersData = [
    {
      playerId: 'p-1',
      showPlayerId: 'PLY-2026-001',
      email: 'player1@tape.com',
      password: hashedPassword,
      gamerTag: 'STRIKER_99',
      firstName: 'Tariq',
      lastName: 'Rahman',
      phoneNumber: '+8801700000001',
      status: 'ACTIVE' as const,
    },
    {
      playerId: 'p-2',
      showPlayerId: 'PLY-2026-002',
      email: 'player2@tape.com',
      password: hashedPassword,
      gamerTag: 'PHANTOM_7',
      firstName: 'Arman',
      lastName: 'Hossain',
      phoneNumber: '+8801700000002',
      status: 'ACTIVE' as const,
    },
  ];

  for (const data of playersData) {
    const player = await prisma.player.upsert({
      where: { email: data.email },
      update: {
        gamerTag: data.gamerTag,
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
        password: data.password,
        status: data.status,
      },
      create: data,
    });
    console.log(`✅ Seeded Player: ${player.email} (${player.gamerTag})`);
  }

  // Register players to an active tournament if available
  const tournament = await prisma.tournament.findFirst({
    where: { isDeleted: false },
  });

  if (tournament) {
    for (const data of playersData) {
      await prisma.tournamentRegistration.upsert({
        where: {
          tournamentId_playerId: {
            tournamentId: tournament.tournamentId,
            playerId: data.playerId,
          },
        },
        update: {
          status: 'CONFIRMED',
          qrCodeString: `PLAYER:${tournament.tournamentId}:${data.playerId}`,
          checkedInVenue: false,
        },
        create: {
          tournamentId: tournament.tournamentId,
          playerId: data.playerId,
          status: 'CONFIRMED',
          qrCodeString: `PLAYER:${tournament.tournamentId}:${data.playerId}`,
          checkedInVenue: false,
        },
      });
    }
    console.log(`✅ Registered both players to Tournament: ${tournament.name}`);
  }
}
