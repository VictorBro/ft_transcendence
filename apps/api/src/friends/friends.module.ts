import { Module } from '@nestjs/common';

import { GatewayModule } from '../gateway/gateway.module';
import { PresenceModule } from '../presence/presence.module';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';

@Module({
  imports: [GatewayModule, PresenceModule],
  controllers: [FriendsController],
  providers: [FriendsService],
})
export class FriendsModule {}
