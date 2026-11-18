import { BadRequestException } from '@nestjs/common';
import { Prisma, TicketStatus } from '@prisma/client';

type TicketConfiguration = {
  tournamentId: string;
  name: string;
  currency: string;
  capacity: number;
  registrationOpen: boolean;
  entryFee?: number | null;
};

/** Call inside the same transaction that changes the tournament. */
export async function syncTournamentTicket(
  db: Prisma.TransactionClient,
  tournament: TicketConfiguration,
) {
  const price = tournament.entryFee ?? 0;
  if (!Number.isFinite(price) || price < 0) {
    throw new BadRequestException(
      'entryFee must be a finite nonnegative number.',
    );
  }
  if (!Number.isInteger(tournament.capacity) || tournament.capacity < 1) {
    throw new BadRequestException(
      'Tournament capacity must be a positive integer.',
    );
  }
  // Share the issuance lock so capacity edits cannot race ticket sales.
  await db.$queryRaw`
    WITH tournament_lock AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(hashtext(${tournament.tournamentId}), hashtext('ticket-issuance'))
    ) SELECT 1::int AS locked FROM tournament_lock
  `;
  const sold = await db.ticket.count({
    where: {
      tournamentId: tournament.tournamentId,
      purchaserRole: 'PLAYER',
      status: { in: [TicketStatus.ACTIVE, TicketStatus.USED] },
    },
  });
  const allTiers = await db.ticketTier.findMany({
    where: { tournamentId: tournament.tournamentId },
  });
  // Only the Player tier is managed from the tournament entry fee. Fan tiers
  // are owned by the existing Fan ticket flow and must remain untouched.
  const existingTiers = allTiers.filter(
    (tier) => tier.tournamentManaged && tier.audienceRole === 'PLAYER',
  );
  const existingSold = existingTiers.reduce(
    (total, tier) => total + tier.sold,
    0,
  );
  if (tournament.capacity < Math.max(sold, existingSold)) {
    throw new BadRequestException(
      'Capacity cannot be lower than tickets already sold.',
    );
  }

  const configuredAudienceRoles = new Set(
    allTiers.map((tier) => tier.audienceRole),
  );
  const data = {
    name: tournament.name,
    price,
    currency: tournament.currency,
    capacity: tournament.capacity,
    status: tournament.registrationOpen ? 'ACTIVE' : 'HIDDEN',
  };
  const existingPlayerTier = existingTiers[0];

  if (existingPlayerTier) {
    return [
      await db.ticketTier.update({
        where: { tierId: existingPlayerTier.tierId },
        data,
      }),
    ];
  }

  // Keep a manually configured Player tier as-is. The auto-managed tier is
  // created only when no Player tier exists, and is then synced to entryFee.
  if (configuredAudienceRoles.has('PLAYER')) return [];

  return [
    await db.ticketTier.create({
      data: {
        ...data,
        tournamentId: tournament.tournamentId,
        tournamentManaged: true,
        audienceRole: 'PLAYER',
        type: 'DAY_PASS',
      },
    }),
  ];
}
