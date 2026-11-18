import { ConflictException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

type AccountRole = 'FAN' | 'PLAYER' | 'EMPLOYEE' | 'ADMIN';
type AccountEmailStore = PrismaClient | Prisma.TransactionClient;

const EMAIL_CONFLICT_MESSAGE =
  'This email is already in use. Fan and linked Player accounts may share an email, but staff and admin accounts must use a unique email.';

export const normalizeAccountEmail = (email: string) =>
  email.trim().toLowerCase();

/**
 * Enforce global email uniqueness for roles that must never share an email.
 * This is used for staff/admin accounts and therefore checks all account
 * tables, including Fan and Player.
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

/**
 * Fan and Player are a linked account pair and may share one email address.
 * They still cannot duplicate an account of the same role, or reuse an email
 * belonging to an Employee/Admin account.
 */
export async function assertFanOrPlayerEmailAvailable(
  prisma: AccountEmailStore,
  email: string,
  role: 'FAN' | 'PLAYER',
  exclude?: { role: 'FAN' | 'PLAYER'; id: string },
) {
  const normalizedEmail = normalizeAccountEmail(email);
  const emailFilter = {
    equals: normalizedEmail,
    mode: 'insensitive' as const,
  };

  const [sameRoleAccount, employee, admin] = await Promise.all([
    role === 'FAN'
      ? prisma.fan.findFirst({
          where: {
            email: emailFilter,
            ...(exclude?.role === 'FAN' ? { fanId: { not: exclude.id } } : {}),
          },
          select: { fanId: true },
        })
      : prisma.player.findFirst({
          where: {
            email: emailFilter,
            ...(exclude?.role === 'PLAYER'
              ? { playerId: { not: exclude.id } }
              : {}),
          },
          select: { playerId: true },
        }),
    prisma.employee.findFirst({
      where: { email: emailFilter },
      select: { employeeId: true },
    }),
    prisma.admin.findFirst({
      where: { email: emailFilter },
      select: { adminId: true },
    }),
  ]);

  if (sameRoleAccount) {
    throw new ConflictException(
      `A ${role.toLowerCase()} account already exists with this email. Sign in to that account.`,
    );
  }
  if (employee || admin) {
    throw new ConflictException(
      'This email belongs to an Employee or Administrator account. Fan and linked Player accounts may share an email, but staff/admin accounts must use a different email.',
    );
  }
}
