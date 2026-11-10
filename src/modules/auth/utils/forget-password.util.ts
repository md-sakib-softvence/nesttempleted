import {
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { ForgetPasswordDto } from '../dto/forget-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';

const RESET_CODE_TTL_MINUTES = 10;
const MAX_RESET_CODE_ATTEMPTS = 5;

export const forgetPasswordUtil = async (
  dto: ForgetPasswordDto,
  prisma: PrismaService,
  mailService: MailService,
) => {
  const email = dto.email.trim().toLowerCase();
  const [fan, player] = await Promise.all([
    prisma.fan.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, isDeleted: false, status: 'ACTIVE' },
      select: { fanId: true },
    }),
    prisma.player.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, isDeleted: false, status: 'ACTIVE' },
      select: { playerId: true },
    }),
  ]);

  // Return the same response for unknown addresses to avoid account enumeration.
  if (!fan && !player) {
    return { message: 'If an active Fan or Player account uses this email, a reset code has been sent.' };
  }

  const resendAfter = new Date(Date.now() - 60_000);
  const recentCode = await prisma.passwordResetCode.findFirst({
    where: { email, consumedAt: null, createdAt: { gt: resendAfter } },
    select: { passwordResetCodeId: true },
  });
  if (recentCode) {
    return { message: 'If an active Fan or Player account uses this email, a reset code has been sent.' };
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60_000);

  await prisma.passwordResetCode.deleteMany({
    where: { email, consumedAt: null },
  });
  await prisma.passwordResetCode.create({
    data: {
      email,
      codeHash,
      requestedRole: dto.role || null,
      expiresAt,
    },
  });

  try {
    await mailService.sendPasswordReset(email, code);
  } catch (error) {
    await prisma.passwordResetCode.deleteMany({ where: { email, codeHash } });
    new Logger('PasswordReset').error(
      `Could not send password reset code: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw new InternalServerErrorException('Could not send the reset code. Please try again later.');
  }

  return {
    message: 'If an active Fan or Player account uses this email, a reset code has been sent.',
    expiresInMinutes: RESET_CODE_TTL_MINUTES,
  };
};

export const resetPasswordWithCodeUtil = async (
  dto: ResetPasswordDto,
  prisma: PrismaService,
) => {
  if (dto.newPassword !== dto.confirmPassword) {
    throw new BadRequestException('New password and confirmation password do not match.');
  }

  const email = dto.email.trim().toLowerCase();
  const challenge = await prisma.passwordResetCode.findFirst({
    where: {
      email,
      consumedAt: null,
      expiresAt: { gt: new Date() },
      attempts: { lt: MAX_RESET_CODE_ATTEMPTS },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!challenge || !(await bcrypt.compare(dto.code, challenge.codeHash))) {
    if (challenge) {
      await prisma.passwordResetCode.update({
        where: { passwordResetCodeId: challenge.passwordResetCodeId },
        data: { attempts: { increment: 1 } },
      });
    }
    throw new UnauthorizedException('The reset code is invalid or expired. Request a new code and try again.');
  }

  const hashedPassword = await bcrypt.hash(
    dto.newPassword,
    Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
  );
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const consumed = await tx.passwordResetCode.updateMany({
      where: {
        passwordResetCodeId: challenge.passwordResetCodeId,
        consumedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: MAX_RESET_CODE_ATTEMPTS },
      },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException('The reset code is invalid, expired, or already used.');
    }

    const accountWhere = {
      email: { equals: email, mode: 'insensitive' as const },
      isDeleted: false,
    };
    const [fanUpdate, playerUpdate] = await Promise.all([
      tx.fan.updateMany({ where: accountWhere, data: { password: hashedPassword } }),
      tx.player.updateMany({ where: accountWhere, data: { password: hashedPassword } }),
    ]);

    if (fanUpdate.count + playerUpdate.count === 0) {
      throw new UnauthorizedException('No active Fan or Player account was found for this email.');
    }
  });

  return { message: 'Password reset successfully for all linked Fan and Player accounts.' };
};
