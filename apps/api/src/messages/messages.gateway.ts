import { UseFilters } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { CLIENT_EVENTS, type DmRead, type DmSend, type Message, type SocketAck } from '@ft/shared';

import { GATEWAY_OPTIONS } from '../gateway/socket.gateway';
import { SocketExceptionFilter } from '../gateway/socket-exception.filter';
import type { AppSocket } from '../gateway/sockets.service';
import { MessagesService } from './messages.service';

/**
 * The payloads arrive parsed and the sender limited: SocketGateway's screen
 * runs before any handler. A refusal is SocketExceptionFilter's to answer.
 */
@WebSocketGateway(GATEWAY_OPTIONS)
@UseFilters(SocketExceptionFilter)
export class MessagesGateway {
  constructor(private readonly messages: MessagesService) {}

  // Nest sends what a handler returns as the ack.
  @SubscribeMessage(CLIENT_EVENTS.DM_SEND)
  async send(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() { userId, text }: DmSend,
  ): Promise<SocketAck<Message>> {
    return { ok: true, data: await this.messages.send(socket.data.userId, userId, text) };
  }

  @SubscribeMessage(CLIENT_EVENTS.DM_READ)
  async read(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() { userId }: DmRead,
  ): Promise<void> {
    await this.messages.read(socket.data.userId, userId);
  }
}
