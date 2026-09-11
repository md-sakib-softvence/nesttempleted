import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoginDto } from '../dto/login.dto';
import { adminLoginUtil } from '../utils/admin.util';
import { employeeLoginUtil } from '../utils/employee.util';
import { fanLoginUtil } from '../utils/fan.util';
import { playerLoginUtil } from '../utils/player.util';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { ForgetPasswordDto } from '../dto/forget-password.dto';
import { formatAuthResponse } from '../utils/auth-response.util';
import { refreshTokenUtil } from '../utils/refresh-token.util';
import { forgetPasswordUtil } from '../utils/forget-password.util';
import { MailService } from '../../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async login(loginDto: LoginDto) {
    switch (loginDto.role) {
      case 'admin':
      case 'super_admin':
        return adminLoginUtil(
          loginDto,
          this.prisma,
          this.jwtService,
          this.configService,
        );
      case 'security':
      case 'employee':
      case 'manager':
      case 'ambassador':
        return employeeLoginUtil(
          loginDto,
          this.prisma,
          this.jwtService,
          this.configService,
        );
      case 'fan':
        return fanLoginUtil(
          loginDto,
          this.prisma,
          this.jwtService,
          this.configService,
        );
      case 'player':
        return playerLoginUtil(
          loginDto,
          this.prisma,
          this.jwtService,
          this.configService,
        );
      default:
        throw new UnauthorizedException(
          `Login for role '${loginDto.role}' is not implemented yet.`,
        );
    }
  }

  async refreshToken(dto: RefreshTokenDto) {
    return refreshTokenUtil(
      dto,
      this.prisma,
      this.jwtService,
      this.configService,
    );
  }

  async forgetPassword(dto: ForgetPasswordDto) {
    return forgetPasswordUtil(
      dto,
      this.prisma,
      this.jwtService,
      this.configService,
      this.mailService,
    );
  }
}
