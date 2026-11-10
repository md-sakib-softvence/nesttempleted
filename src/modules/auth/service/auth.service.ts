import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
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
import { ChangePasswordDto } from '../dto/change-password.dto';
import { formatAuthResponse } from '../utils/auth-response.util';
import { refreshTokenUtil } from '../utils/refresh-token.util';
import {
  forgetPasswordUtil,
  resetPasswordWithCodeUtil,
} from '../utils/forget-password.util';
import { changePasswordUtil } from '../utils/change-password.util';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { MailService } from '../../mail/mail.service';
import { createActivities } from '../../utils/activity.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async login(loginDto: LoginDto) {
    let result;
    switch (loginDto.role) {
      case 'admin':
      case 'super_admin':
        result = await adminLoginUtil(
          loginDto,
          this.prisma,
          this.jwtService,
          this.configService,
        );
        break;
      case 'manager':
        result = await employeeLoginUtil(
          loginDto,
          this.prisma,
          this.jwtService,
          this.configService,
        );
        break;
      case 'security':
      case 'security_guard':
      case 'employee':
      case 'ambassador':
        result = await employeeLoginUtil(
          loginDto,
          this.prisma,
          this.jwtService,
          this.configService,
        );
        break;
      case 'fan':
        result = await fanLoginUtil(
          loginDto,
          this.prisma,
          this.jwtService,
          this.configService,
        );
        break;
      case 'player':
        result = await playerLoginUtil(
          loginDto,
          this.prisma,
          this.jwtService,
          this.configService,
        );
        break;
      default:
        throw new UnauthorizedException(
          `Login for role '${loginDto.role}' is not implemented yet.`,
        );
    }

    // Audit logging must not prevent an otherwise valid login. If the audit
    // table/schema is temporarily unavailable, keep authentication successful
    // and surface the database problem in the server logs for repair.
    try {
      const title = 'User Authentication';
      const description = `User ${result.user.name} (${loginDto.email}) successfully authenticated and logged in with the role of '${loginDto.role}'.`;
      await createActivities(this.prisma, title, description, loginDto.role);
    } catch (error) {
      this.logger.warn(
        `Login audit log could not be recorded for ${loginDto.email}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (loginDto.role.toLowerCase() === 'player' && result.user?.userId) {
      try {
        await this.prisma.playerActivityLog.create({
          data: {
            playerId: result.user.userId,
            eventType: 'PLAYER_LOGIN',
            title: 'Signed in',
            description: 'You signed in to your player account.',
            actorId: result.user.userId,
            actorRole: 'PLAYER',
          },
        });
      } catch (error) {
        this.logger.warn(
          `Player login activity could not be recorded: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return result;
  }

  async logoutPlayer(user: { userId: string; role: string }) {
    if (user.role.toLowerCase() === 'player') {
      try {
        await this.prisma.playerActivityLog.create({
          data: {
            playerId: user.userId,
            eventType: 'PLAYER_LOGOUT',
            title: 'Signed out',
            description: 'You signed out of your player account.',
            actorId: user.userId,
            actorRole: 'PLAYER',
          },
        });
      } catch (error) {
        this.logger.warn(
          `Player logout activity could not be recorded: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return { success: true };
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
      this.mailService,
    );
  }

  async resetPasswordWithCode(dto: ResetPasswordDto) {
    return resetPasswordWithCodeUtil(dto, this.prisma);
  }

  async changePassword(
    userSession: { userId: string; email: string; role: string },
    dto: ChangePasswordDto,
  ) {
    return changePasswordUtil(userSession, dto, this.prisma, this.mailService);
  }
}
