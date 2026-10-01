import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

// CORS restricted to the known frontend origin — not wildcard.
// maxHttpBufferSize: 1MB cap to prevent memory exhaustion (CVE socket.io-parser DoS).
// connectTimeout: 10s to reject slow/incomplete handshakes.
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/realtime',
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 1e6,
  connectTimeout: 10000,
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private connectedClients: Map<string, { userId: string; eventIds: string[] }> = new Map();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const isBlacklisted = await this.redisService.isTokenBlacklisted(token);
      if (isBlacklisted) {
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });
      if (payload.type !== 'access') throw new Error('Invalid token type');

      client.data.user = payload;
      this.connectedClients.set(client.id, { userId: payload.sub, eventIds: [] });

      this.logger.log(`Client connected: ${client.id} (User: ${payload.sub})`);
      client.emit('connected', { message: 'Connected to real-time service', userId: payload.sub });
    } catch (error) {
      this.logger.warn(`Client ${client.id} authentication failed: ${error.message}`);
      client.disconnect();
    }
  }

  private async canFollowEvent(user: { sub: string; role: string }, eventId: string): Promise<boolean> {
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return true;
    if (user.role === 'CONTROLLER') {
      const assignment = await this.prisma.controllerEvent.findUnique({
        where: { controllerId_eventId: { controllerId: user.sub, eventId } },
        select: { id: true },
      });
      return !!assignment;
    }
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { organizerId: true } });
    if (!event) return false;
    if (event.organizerId === user.sub) return true;
    // Account collaborators follow the owner's events
    const membership = await this.prisma.accountMember.findFirst({
      where: { ownerId: event.organizerId, userId: user.sub },
      select: { id: true },
    });
    return !!membership;
  }

  handleDisconnect(client: Socket) {
    const clientData = this.connectedClients.get(client.id);
    if (clientData) {
      // Leave all event rooms
      clientData.eventIds.forEach((eventId) => {
        client.leave(`event:${eventId}`);
      });
      this.connectedClients.delete(client.id);
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:event')
  async handleJoinEvent(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { eventId: string },
  ) {
    if (!client.data.user) {
      throw new WsException('Unauthorized');
    }

    const { eventId } = data;
    if (!eventId) {
      throw new WsException('eventId is required');
    }

    // Live scan feeds carry guest names: only the event's organizer, admins
    // and controllers assigned to the event may subscribe.
    if (!(await this.canFollowEvent(client.data.user, eventId))) {
      throw new WsException('Access denied for this event');
    }

    await client.join(`event:${eventId}`);

    const clientData = this.connectedClients.get(client.id);
    if (clientData && !clientData.eventIds.includes(eventId)) {
      clientData.eventIds.push(eventId);
    }

    this.logger.log(`Client ${client.id} joined event room: ${eventId}`);
    client.emit('joined:event', { eventId, message: `Joined event ${eventId} room` });

    return { success: true, eventId };
  }

  @SubscribeMessage('leave:event')
  async handleLeaveEvent(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { eventId: string },
  ) {
    const { eventId } = data;
    await client.leave(`event:${eventId}`);

    const clientData = this.connectedClients.get(client.id);
    if (clientData) {
      clientData.eventIds = clientData.eventIds.filter((id) => id !== eventId);
    }

    this.logger.log(`Client ${client.id} left event room: ${eventId}`);
    return { success: true, eventId };
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    return { event: 'pong', data: { timestamp: Date.now() } };
  }

  @SubscribeMessage('get:checkin-stats')
  async handleGetCheckInStats(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { eventId: string },
  ) {
    if (!client.data.user) {
      throw new WsException('Unauthorized');
    }

    // Emit current stats back to the requesting client
    const { eventId } = data;
    client.emit('checkin-stats:update', {
      eventId,
      requestedAt: new Date().toISOString(),
    });
  }

  // Emit a scan result to all clients watching a specific event
  emitToEvent(eventId: string, event: string, data: any) {
    this.server.to(`event:${eventId}`).emit(event, {
      ...data,
      eventId,
      timestamp: new Date().toISOString(),
    });
  }

  // Emit to a specific user across all their connections
  emitToUser(userId: string, event: string, data: any) {
    // Find all socket IDs for this user
    this.connectedClients.forEach((clientData, socketId) => {
      if (clientData.userId === userId) {
        this.server.to(socketId).emit(event, data);
      }
    });
  }

  // Broadcast to all connected clients
  broadcast(event: string, data: any) {
    this.server.emit(event, data);
  }

  // Get count of clients in a room
  async getRoomSize(eventId: string): Promise<number> {
    const sockets = await this.server.in(`event:${eventId}`).fetchSockets();
    return sockets.length;
  }

  // Get total connected clients
  getConnectedCount(): number {
    return this.connectedClients.size;
  }

  // Emit real-time check-in stats update
  emitCheckInUpdate(eventId: string, stats: {
    totalCheckedIn: number;
    totalSold: number;
    checkInRate: number;
    lastTicket?: {
      serialNumber: string;
      holderName?: string;
      templateName?: string;
    };
  }) {
    this.emitToEvent(eventId, 'checkin:update', stats);
  }

  // Emit fraud alert
  emitFraudAlert(eventId: string, data: {
    ticketSerial: string;
    controllerId: string;
    controllerName: string;
    location?: string;
  }) {
    this.emitToEvent(eventId, 'fraud:alert', {
      ...data,
      severity: 'HIGH',
      requiresAttention: true,
    });
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth?.token ||
      client.handshake.headers?.authorization;

    if (!auth) return null;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      return auth.substring(7);
    }
    return auth as string;
  }
}
