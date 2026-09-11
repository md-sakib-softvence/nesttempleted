import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { formatAuthResponse } from './auth-response.util';
import { RefreshTokenDto } from '../dto/refresh-token.dto';

export const refreshTokenUtil = async (
  dto: RefreshTokenDto,
  prisma: PrismaService,
  jwtService: JwtService,
  configService: ConfigService,
) => {
  const refreshSecret =
    configService.get<string>('JWT_REFRESH_SECRET') ||
    'default_refresh_secret_key';
  const refreshExpiresIn =
    configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '30d';

  let payload: any;
  try {
    payload = await jwtService.verifyAsync(dto.refreshToken, {
      secret: refreshSecret,
    });
  } catch (err) {
    throw new UnauthorizedException('Invalid or expired refresh token');
  }

  const { userId, role } = payload;
  let user: any = null;
  let idField = '';
  let userRole = 'user';
  let name = '';

  switch (role) {
    case 'admin':
    case 'super_admin':
    case 'ADMIN':
    case 'SUPER_ADMIN':
      user = await prisma.admin.findUnique({
        where: { adminId: userId },
      });
      idField = 'adminId';
      if (user) {
        userRole = user.role;
        name = user.name;
      }
      break;
    case 'security':
    case 'employee':
    case 'manager':
    case 'ambassador':
    case 'SECURITY':
    case 'EMPLOYEE':
    case 'MANAGER':
    case 'AMBASSADOR':
      user = await prisma.employee.findUnique({
        where: { employeeId: userId },
      });
      idField = 'employeeId';
      if (user) {
        userRole = user.role;
        name = user.name;
      }
      break;
    case 'fan':
    case 'FAN':
      user = await prisma.fan.findUnique({ where: { fanId: userId } });
      idField = 'fanId';
      if (user) {
        userRole = 'FAN';
        name = user.firstName;
      }
      break;
    case 'player':
    case 'PLAYER':
      user = await prisma.player.findUnique({
        where: { playerId: userId },
      });
      idField = 'playerId';
      if (user) {
        userRole = 'PLAYER';
        name = `${user.firstName} ${user.lastName}`;
      }
      break;
    default:
      throw new UnauthorizedException(
        `Role '${role}' is not supported for refresh.`,
      );
  }

  if (!user) {
    throw new UnauthorizedException('User not found');
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

  const newPayload = {
    userId: user[idField],
    email: user.email,
    role: userRole,
  };

  const newAccessToken = jwtService.sign(newPayload);
  const newRefreshToken = jwtService.sign(newPayload, {
    secret: refreshSecret,

    expiresIn: refreshExpiresIn as any,
  });

  return formatAuthResponse(
    newAccessToken,
    newRefreshToken,
    {
      userId: user[idField],
      email: user.email,
      name: name,
      role: userRole,
    },
    'Token refreshed successfully',
  );
};
