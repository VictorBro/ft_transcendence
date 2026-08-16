import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/chat',
  path: '/ws',
  cors: false,
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  handleConnection(socket: Socket): void {
    console.log(`WebSocket connected: ${socket.id}`);

    socket.emit('connected', {
      message: 'Hello from NestJS',
    });
  }

  handleDisconnect(socket: Socket): void {
    console.log(`WebSocket disconnected: ${socket.id}`);
  }

  @SubscribeMessage('chat')
  handleChat(@MessageBody() message: string, @ConnectedSocket() socket: Socket): void {
    console.log(`Received from ${socket.id}: ${message}`);

    // Send the message back to the sender.
    socket.emit('chat', {
      from: socket.id,
      message,
    });
  }
}
