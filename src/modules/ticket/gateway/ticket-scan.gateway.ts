import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/ticket-scan',
})
export class TicketScanGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TicketScanGateway.name);

  afterInit(server: Server) {
    this.logger.log(
      '🚀 TicketScan WebSocket Gateway initialized on /ticket-scan',
    );
  }

  handleConnection(client: Socket) {
    this.logger.log(`Guard connected to /ticket-scan: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Guard disconnected from /ticket-scan: ${client.id}`);
  }

  /**
   * Broadcast a real-time ticket scan event to all connected security guards
   */
  broadcastScan(scanData: any) {
    try {
      if (this.server) {
        this.server.emit('ticket:scanned', scanData);
      }
    } catch (err) {
      this.logger.error('Failed to broadcast ticket scan via Socket.IO', err);
    }
  }
}
