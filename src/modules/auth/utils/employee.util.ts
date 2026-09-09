/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from '../dto/login.dto';
import * as bcrypt from 'bcrypt';
import { formatAuthResponse } from './auth-response.util';

export const employeeLoginUtil = async (
  loginDto: LoginDto,
  prisma: PrismaService,
  jwtService: JwtService,
  configService: ConfigService,
) => {
  const employee = await prisma.employee.findUnique({
    where: { email: loginDto.email },
  });

  if (!employee) {
    throw new UnauthorizedException(
      'Authentication failed. Please check your credentials and try again.',
    );
  }

  if (employee.isDeleted) {
    throw new UnauthorizedException(
      'Access denied. This account has been permanently deactivated.',
    );
  }

  if (employee.state !== 'ACTIVE') {
    const statusMessage =
      employee.state === 'TERMINATE' ? 'terminated' : 'currently inactive';

    throw new UnauthorizedException(
      `Access denied. Your account is ${statusMessage}. Please contact support for assistance.`,
    );
  }

  const isPasswordValid = await bcrypt.compare(
    loginDto.password,
    employee.password,
  );
  if (!isPasswordValid) {
    throw new UnauthorizedException(
      'Authentication failed. Please check your credentials and try again.',
    );
  }

  const payload = {
    userId: employee.employeeId,
    email: employee.email,
    role: employee.role,
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
    userId: employee.employeeId,
    email: employee.email,
    name: employee.name,
    role: employee.role,
  });
};
