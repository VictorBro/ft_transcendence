import { Module } from '@nestjs/common';

import { GatewayModule } from '../gateway/gateway.module';
import { PresenceModule } from '../presence/presence.module';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';

// Exported for chat (#158). Presence asks friend-ids.ts instead: the gateway
// cannot import this module, which imports it.
@Module({
  imports: [GatewayModule, PresenceModule],
  controllers: [FriendsController],
  providers: [FriendsService],
  exports: [FriendsService],
})
export class FriendsModule {}
