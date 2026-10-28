import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { createActivities } from '../../utils/activity.util';
import { MailService } from '../../mail/mail.service';

export const changePasswordUtil = async (
  userSession: { userId: string; email: string; role: string },
  dto: ChangePasswordDto,
  prisma: PrismaService,
  mailService?: MailService,
) => {
  const logger = new Logger('ChangePassword');

  if (dto.newPassword !== dto.confirmPassword) {
    throw new BadRequestException(
      'New password and confirmation password do not match.',
    );
  }

  if (dto.currentPassword === dto.newPassword) {
    throw new BadRequestException(
      'New password must be different from your current password.',
    );
  }

  const role = (userSession.role || '').toLowerCase();
  let userRecord: any = null;
  let idField = '';
  let entityName = '';

  switch (role) {
    case 'player':
      userRecord = await prisma.player.findUnique({
        where: { playerId: userSession.userId },
      });
      idField = 'playerId';
      entityName = 'player';
      break;

    case 'admin':
    case 'super_admin':
      userRecord = await prisma.admin.findUnique({
        where: { adminId: userSession.userId },
      });
      idField = 'adminId';
      entityName = 'admin';
      break;

    case 'fan':
      userRecord = await prisma.fan.findUnique({
        where: { fanId: userSession.userId },
      });
      idField = 'fanId';
      entityName = 'fan';
      break;

    case 'employee':
    case 'manager':
    case 'security':
    case 'ambassador':
      userRecord = await prisma.employee.findUnique({
        where: { employeeId: userSession.userId },
      });
      idField = 'employeeId';
      entityName = 'employee';
      break;

    default:
      throw new UnauthorizedException(
        `Role '${userSession.role}' is not supported.`,
      );
  }

  if (!userRecord || userRecord.isDeleted) {
    throw new NotFoundException('User account not found or is deactivated.');
  }

  if (userRecord.status && userRecord.status !== 'ACTIVE') {
    throw new UnauthorizedException(
      `Access denied. Your account status is ${userRecord.status}.`,
    );
  }

  const isCurrentPasswordValid = await bcrypt.compare(
    dto.currentPassword,
    userRecord.password,
  );

  if (!isCurrentPasswordValid) {
    logger.warn(
      `Failed password change attempt: Invalid current password for ${userSession.email} (${userSession.role})`,
    );
    throw new UnauthorizedException(
      'The current password you entered is incorrect.',
    );
  }

  const hashedPassword = await bcrypt.hash(
    dto.newPassword,
    Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
  );

  // Update password in respective model
  await (prisma as any)[entityName].update({
    where: { [idField]: userSession.userId },
    data: { password: hashedPassword },
  });

  // Log security activity
  const title = 'Password Change';
  const description = `User ${userRecord.firstName || userRecord.name || userSession.email} (${userSession.email}) successfully changed their account password.`;
  await createActivities(
    prisma,
    title,
    description,
    userSession.role.toUpperCase(),
  );

  // Optional: send email notification
  if (mailService && userRecord.email) {
    try {
      if (
        typeof (mailService as any).sendPasswordChangedNotification ===
        'function'
      ) {
        await (mailService as any).sendPasswordChangedNotification(
          userRecord.email,
          userRecord.firstName || userRecord.name,
        );
      }
    } catch (e) {
      logger.error('Failed to dispatch password change alert email:', e);
    }
  }

  logger.log(
    `Password successfully changed for ${userSession.email} (${userSession.role})`,
  );

  return {
    success: true,
    message: 'Your password has been changed successfully.',
  };
};
