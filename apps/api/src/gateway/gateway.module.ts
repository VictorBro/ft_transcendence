import { Module } from '@nestjs/common';

import { PresenceModule } from '../presence/presence.module';
import { SocketGateway } from './socket.gateway';
import { SocketsService } from './sockets.service';

/**
 * Prisma and Redis are the two globals. Presence imports nothing, so this module
 * and FriendsModule, which imports this one, can both import it.
 */
@Module({
  imports: [PresenceModule],
  providers: [SocketGateway, SocketsService],
  exports: [SocketsService],
})
export class GatewayModule {}
