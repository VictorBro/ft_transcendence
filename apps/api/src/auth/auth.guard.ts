import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SessionUser } from '@ft/shared';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import { IS_PUBLIC } from './auth.decorators';

/**
 * Registered globally, so a new route is private unless it says otherwise.
 * The opposite default is how endpoints end up unprotected by omission.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    const userId = request.session?.userId;
    if (userId === undefined) {
      throw new UnauthorizedException();
    }

    // Re-read the user rather than trusting a copy in the session: a deleted or
    // demoted account must lose access on its next request, not at expiry.
    const user = await this.auth.findById(userId);
    if (user === null) {
      request.session.destroy(() => undefined);
      throw new UnauthorizedException();
    }

    request.user = user;
    return true;
  }
}
