import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
@WebSocketGateway({
  namespace: '/match-incidents',
  cors: { origin: true, credentials: true },
})
export class MatchIncidentGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MatchIncidentGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      if (typeof token !== 'string') throw new Error('Authentication required');
      const user = await this.jwt.verifyAsync(token, {
        secret:
          this.config.get<string>('JWT_SECRET') ||
          'super_secret_change_in_production',
      });
      const role = String(user.role || '').toUpperCase();
      if (
        !['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'EMPLOYEE'].includes(role) ||
        !user.userId
      ) {
        throw new Error('Staff access required');
      }
      const active = ['ADMIN', 'SUPER_ADMIN'].includes(role)
        ? await this.prisma.admin.findFirst({
            where: {
              adminId: user.userId,
              role,
              status: 'ACTIVE',
              isDeleted: false,
            } as any,
          })
        : await this.prisma.employee.findFirst({
            where: {
              employeeId: user.userId,
              role,
              state: 'ACTIVE',
              isDeleted: false,
            } as any,
          });
      if (!active) throw new Error('Account is not active');
      client.data.user = user;
      await client.join(`user:${user.userId}`);
      if (role !== 'EMPLOYEE') await client.join('reviewers');
      client.emit('incidents:ready');
      // Expired credentials must not continue receiving operational information.
      const timeout = setTimeout(
        () => client.disconnect(true),
        Math.min(Math.max(0, user.exp * 1000 - Date.now()), 2147483647),
      );
      client.once('disconnect', () => clearTimeout(timeout));
    } catch {
      client.emit('incidents:unauthorized', {
        message: 'Sign in with an active staff account.',
      });
      client.disconnect(true);
    }
  }

  publish(
    event: 'incident:created' | 'incident:updated' | 'match:updated',
    payload: any,
    userIds: string[] = [],
  ) {
    if (!this.server) return;
    try {
      this.server
        .to(['reviewers', ...userIds.filter(Boolean).map((id) => `user:${id}`)])
        .emit(event, payload);
    } catch (error) {
      this.logger.error('Could not deliver match incident update', error);
    }
  }
}
