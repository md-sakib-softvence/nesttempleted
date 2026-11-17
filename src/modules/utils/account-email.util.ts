import { ConflictException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

type AccountRole = 'FAN' | 'PLAYER' | 'EMPLOYEE' | 'ADMIN';
type AccountEmailStore = PrismaClient | Prisma.TransactionClient;

const EMAIL_CONFLICT_MESSAGE =
  'This email is already registered to an account. Use a different email or sign in to the existing account.';

export const normalizeAccountEmail = (email: string) =>
  email.trim().toLowerCase();

/**
 * Emails are unique across independent account roles, not only within each
 * individual table. This policy applies to every account creation path,
 * including Fan -> Player conversion: an email belongs to one account only.
 */
export async function assertAccountEmailAvailable(
  prisma: AccountEmailStore,
  email: string,
  exclude?: { role: AccountRole; id: string },
) {
  const normalizedEmail = normalizeAccountEmail(email);
  const emailFilter = {
    equals: normalizedEmail,
    mode: 'insensitive' as const,
  };

  const [fan, player, employee, admin] = await Promise.all([
    prisma.fan.findFirst({
      where: {
        email: emailFilter,
        ...(exclude?.role === 'FAN' ? { fanId: { not: exclude.id } } : {}),
      },
      select: { fanId: true },
    }),
    prisma.player.findFirst({
      where: {
        email: emailFilter,
        ...(exclude?.role === 'PLAYER'
          ? { playerId: { not: exclude.id } }
          : {}),
      },
      select: { playerId: true },
    }),
    prisma.employee.findFirst({
      where: {
        email: emailFilter,
        ...(exclude?.role === 'EMPLOYEE'
          ? { employeeId: { not: exclude.id } }
          : {}),
      },
      select: { employeeId: true },
    }),
    prisma.admin.findFirst({
      where: {
        email: emailFilter,
        ...(exclude?.role === 'ADMIN'
          ? { adminId: { not: exclude.id } }
          : {}),
      },
      select: { adminId: true },
    }),
  ]);

  if (fan || player || employee || admin) {
    throw new ConflictException(EMAIL_CONFLICT_MESSAGE);
  }
}
