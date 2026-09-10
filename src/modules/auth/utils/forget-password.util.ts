import { InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { ForgetPasswordDto } from '../dto/forget-password.dto';

export const forgetPasswordUtil = async (
  dto: ForgetPasswordDto,
  prisma: PrismaService,
  jwtService: JwtService,
  configService: ConfigService,
  mailService: MailService,
) => {
  let user: any = null;
  let idField = '';
  let userRole = '';

  switch (dto.role) {
    case 'admin':
    case 'super_admin':
      user = await prisma.admin.findUnique({ where: { email: dto.email } });
      idField = 'adminId';
      if (user) userRole = user.role;
      break;
    case 'security':
    case 'employee':
    case 'manager':
    case 'ambassador':
      user = await prisma.employee.findUnique({ where: { email: dto.email } });
      idField = 'employeeId';
      if (user) userRole = user.role;
      break;
    case 'fan':
      user = await prisma.fan.findUnique({ where: { email: dto.email } });
      idField = 'fanId';
      if (user) userRole = 'FAN';
      break;
    case 'player':
      user = await prisma.player.findUnique({ where: { email: dto.email } });
      idField = 'playerId';
      if (user) userRole = 'PLAYER';
      break;
    default:
      throw new UnauthorizedException(`Role '${dto.role}' is not supported.`);
  }

  if (!user) {
    throw new NotFoundException('User with this email not found');
  }

  if (user.isDeleted) {
    throw new UnauthorizedException(
      'Access denied. This account has been permanently deactivated.',
    );
  }

  const isActive = user.status === 'ACTIVE' || user.state === 'ACTIVE';
  if (!isActive) {
    throw new UnauthorizedException(`Access denied. Your account is inactive.`);
  }

  const payload = {
    userId: user[idField],
    email: user.email,
    role: userRole,
    type: 'PASSWORD_RESET',
  };

  const secret = configService.get<string>('JWT_SECRET');
  if (!secret) {
    throw new InternalServerErrorException(
      'JWT_SECRET is not defined in environment variables',
    );
  }
  const resetToken = jwtService.sign(payload, { secret, expiresIn: '15m' });

  // Send email with reset token
  await mailService.sendPasswordResetLink(user.email, resetToken);

  return {
    message: 'Password reset link sent successfully to your email',
  };
};
