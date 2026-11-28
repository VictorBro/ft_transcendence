import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { GatewayModule } from './gateway/gateway.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { IdentityThrottlerGuard } from './throttler/identity-throttler.guard';
import { RATE_LIMITS } from './throttler/rate-limits';
import { UsersModule } from './users/users.module';
import { FriendsModule } from './friends/friends.module';
import { CoursesModule } from './courses/courses.module';
import { PlacementModule } from './placement/placement.module';
import { LessonsModule } from './lessons/lessons.module';
import { MessagesModule } from './messages/messages.module';
import { TutorModule } from './tutor/tutor.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // One ceiling for everyone, 100 a minute by default (RATE_LIMIT_PER_MINUTE).
    // What IdentityThrottlerGuard changes is not the number but who it is
    // counted against: each account on its own key, each anonymous visitor on
    // their own address.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: RATE_LIMITS.perAccount }],
      errorMessage: 'server.rateLimited',
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    FriendsModule,
    MessagesModule,
    HealthModule,
    CoursesModule,
    PlacementModule,
    LessonsModule,
    TutorModule,
    GatewayModule,
    MetricsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: IdentityThrottlerGuard }],
})
export class AppModule {}
