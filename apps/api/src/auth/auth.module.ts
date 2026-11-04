import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { GatewayModule } from '../gateway/gateway.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';

@Module({
  imports: [GatewayModule],
  controllers: [AuthController],
  providers: [AuthService, TwoFactorService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService],
})
export class AuthModule {}
