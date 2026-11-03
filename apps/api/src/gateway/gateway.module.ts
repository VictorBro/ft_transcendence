import { Module } from '@nestjs/common';

import { SocketGateway } from './socket.gateway';
import { SocketsService } from './sockets.service';

/** Imports nothing: Prisma and Redis are the two globals. */
@Module({ providers: [SocketGateway, SocketsService], exports: [SocketsService] })
export class GatewayModule {}
