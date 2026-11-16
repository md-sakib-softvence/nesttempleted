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
      status: { in: [TicketStatus.ACTIVE, TicketStatus.USED] },
    },
  });
  const existing = await db.ticketTier.findFirst({
    where: { tournamentId: tournament.tournamentId, tournamentManaged: true },
  });
  if (tournament.capacity < Math.max(sold, existing?.sold ?? 0)) {
    throw new BadRequestException(
      'Capacity cannot be lower than tickets already sold.',
    );
  }
  const data = {
    name: tournament.name,
    price,
    currency: tournament.currency,
    capacity: tournament.capacity,
    status: tournament.registrationOpen ? 'ACTIVE' : 'HIDDEN',
  };
  if (existing) {
    return db.ticketTier.update({ where: { tierId: existing.tierId }, data });
  }
  if (!tournament.registrationOpen) return null;
  return db.ticketTier.create({
    data: {
      ...data,
      tournamentId: tournament.tournamentId,
      tournamentManaged: true,
      audienceRole: 'FAN',
      type: 'DAY_PASS',
    },
  });
}
