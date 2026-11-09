import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { EmployeeRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: true, credentials: true },
})
export class NotificationGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(NotificationGateway.name);

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
      if (!user.userId) {
        throw new Error('Authenticated account required');
      }

      if (role === 'FAN') {
        const fan = await this.prisma.fan.findFirst({
          where: { fanId: user.userId, status: 'ACTIVE', isDeleted: false },
          select: { fanId: true },
        });
        if (!fan) throw new Error('Active fan account required');
      } else if (role === 'PLAYER') {
        const player = await this.prisma.player.findFirst({
          where: { playerId: user.userId, status: 'ACTIVE', isDeleted: false },
          select: { playerId: true },
        });
        if (!player) throw new Error('Active player account required');
      } else if (['EMPLOYEE', 'MANAGER', 'AMBASSADOR', 'SECURITY'].includes(role)) {
        const employee = await this.prisma.employee.findFirst({
          where: {
            employeeId: user.userId,
            state: 'ACTIVE',
            isDeleted: false,
            role: role as EmployeeRole,
          },
          select: { employeeId: true },
        });
        if (!employee) throw new Error('Active staff account required');
      } else {
        throw new Error('Player, fan, or staff access required');
      }

      await client.join(`user:${user.userId}`);
      client.emit('notifications:ready');
    } catch {
      client.emit('notifications:unauthorized', {
        message: 'Sign in with an active player, fan, or staff account.',
      });
      client.disconnect(true);
    }
  }

  publishCreated(userId: string) {
    if (!this.server) return;
    try {
      this.server.to(`user:${userId}`).emit('notification:created');
    } catch (error) {
      this.logger.error('Could not deliver notification update', error);
    }
  }
}
