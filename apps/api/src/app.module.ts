import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { IdentityThrottlerGuard } from './throttler/identity-throttler.guard';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // One ceiling for everyone. What IdentityThrottlerGuard changes is not the
    // number but who it is counted against: each account on its own key, each
    // anonymous visitor on their own address.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: IdentityThrottlerGuard }],
})
export class AppModule {}
