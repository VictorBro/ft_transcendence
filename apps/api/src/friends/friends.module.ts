import { Module } from '@nestjs/common';

import { GatewayModule } from '../gateway/gateway.module';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';

// Exported for presence (#157) and chat (#158), which both ask who is a friend.
@Module({
  imports: [GatewayModule],
  controllers: [FriendsController],
  providers: [FriendsService],
  exports: [FriendsService],
})
export class FriendsModule {}
