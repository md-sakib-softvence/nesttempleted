import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from '../dto/login.dto';
import * as bcrypt from 'bcrypt';
import { formatAuthResponse } from './auth-response.util';

export const fanLoginUtil = async (
  loginDto: LoginDto,
  prisma: PrismaService,
  jwtService: JwtService,
  configService: ConfigService,
) => {
  const fan = await prisma.fan.findUnique({
    where: { email: loginDto.email },
  });

  if (!fan) {
    throw new UnauthorizedException(
      'Authentication failed. Please check your credentials and try again.',
    );
  }

  if (fan.isDeleted) {
    throw new UnauthorizedException(
      'Access denied. This account has been permanently deactivated.',
    );
  }

  if (fan.status !== 'ACTIVE') {
    const statusMessage =
      fan.status === 'BANNED' ? 'banned' : 'currently inactive';

    throw new UnauthorizedException(
      `Access denied. Your account is ${statusMessage}. Please contact support for assistance.`,
    );
  }

  const isPasswordValid = await bcrypt.compare(loginDto.password, fan.password);
  if (!isPasswordValid) {
    throw new UnauthorizedException(
      'Authentication failed. Please check your credentials and try again.',
    );
  }

  const payload = {
    userId: fan.fanId,
    email: fan.email,
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

    expiresIn: refreshExpiresIn as any,
  });

  return formatAuthResponse(accessToken, refreshToken, {
    userId: fan.fanId,
    email: fan.email,
    name: fan.firstName,
    role: loginDto.role,
  });
};
