import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from '../dto/login.dto';
import * as bcrypt from 'bcrypt';
import { formatAuthResponse } from './auth-response.util';

export const playerLoginUtil = async (
  loginDto: LoginDto,
  prisma: PrismaService,
  jwtService: JwtService,
  configService: ConfigService,
) => {
  const player = await prisma.player.findUnique({
    where: { email: loginDto.email },
  });

  if (!player) {
    throw new UnauthorizedException(
      'Authentication failed. Please check your credentials and try again.',
    );
  }

  if (player.isDeleted) {
    throw new UnauthorizedException(
      'Access denied. This account has been permanently deactivated.',
    );
  }

  if (player.status !== 'ACTIVE') {
    const statusMessage =
      player.status === 'SUSPENDED'
        ? 'temporarily suspended'
        : 'permanently banned';

    throw new UnauthorizedException(
      `Access denied. Your account is ${statusMessage}. Please contact support for assistance.`,
    );
  }

  const isPasswordValid = await bcrypt.compare(
    loginDto.password,
    player.password,
  );
  if (!isPasswordValid) {
    throw new UnauthorizedException(
      'Authentication failed. Please check your credentials and try again.',
    );
  }

  const payload = {
    userId: player.playerId,
    email: player.email,
    role: loginDto.role,
  };
  const accessToken = jwtService.sign(payload);
  const refreshSecret =
    configService.get<string>('JWT_REFRESH_SECRET') ||
    'default_refresh_secret_key';
  const refreshExpiresIn =
    configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '30d';

  const refreshToken = jwtService.sign(payload, {
    secret: refreshSecret,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    expiresIn: refreshExpiresIn as any,
  });

  return formatAuthResponse(accessToken, refreshToken, {
    userId: player.playerId,
    email: player.email,
    name: player.firstName,
    role: loginDto.role,
  });
};
