import { Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import type { RealtimeEventMap } from "./realtime-events.types";

export function maskPhone(e164: string): string {
  if (e164.length < 8) return "***";
  return `${e164.slice(0, 6)}****${e164.slice(-4)}`;
}

@WebSocketGateway({
  cors: { origin: process.env["WEB_APP_URL"] ?? "http://localhost:3000" },
  transports: ["websocket"],
  pingInterval: 25000,
  pingTimeout: 60000
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private emitCount = 0;

  @WebSocketServer()
  private server!: Server;

  handleConnection(client: Socket): void {
    this.logger.log(`Socket connected: ${client.id}`);
    // TODO: JWT auth — extract tenantId from client.handshake.auth.token
    // TODO: client.join(`tenant:${tenantId}`)
    // TODO: client.join(`supervisor:${userId}`)
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Socket disconnected: ${client.id}`);
  }

  emit<K extends keyof RealtimeEventMap>(
    event: K,
    data: RealtimeEventMap[K]["data"]
  ): void {
    const envelope = {
      event,
      version: 1 as const,
      timestamp: new Date().toISOString(),
      data
    };
    this.server.emit(event as string, envelope);
    this.emitCount++;
    this.logger.log(`Emitted ${event} (total: ${this.emitCount})`);
    // TODO: Redis adapter — replace with room-based emit:
    // this.server.to(`tenant:${tenantId}`).emit(event, envelope)
    // TODO: room per clinic: this.server.to(`clinic:${clinicId}`).emit(...)
    // TODO: room per supervisor: this.server.to(`supervisor:${userId}`).emit(...)
  }
}
