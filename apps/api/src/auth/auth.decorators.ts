import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { SessionUser } from '@ft/shared';
import type { Request } from 'express';

export const IS_PUBLIC = 'auth:public';

/** Opens a route to anonymous callers. Everything else requires a session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** The user AuthGuard resolved. Only meaningful on a guarded route. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  return context.switchToHttp().getRequest<Request & { user?: SessionUser }>().user;
});
