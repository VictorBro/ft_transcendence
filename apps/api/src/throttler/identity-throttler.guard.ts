import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';
import type { Request } from 'express';

import { THROTTLE_BY_IP } from './throttle-by-ip.decorator';

/**
 * Set by handleRequest, read back by getTracker, which receives nothing but the
 * request and so has no other way to learn what the route asked for.
 * Symbol-keyed to stay clear of anything express puts on req.
 */
const BY_IP = Symbol('identity-throttler:by-ip');

type TrackedRequest = Request & { [BY_IP]?: boolean };

/**
 * Counts requests per caller identity instead of per `req.ip`.
 *
 * The default tracker is wrong for this deployment, and not marginally so.
 * Nothing reaches the API from a client address: Caddy proxies browser traffic
 * and Next.js calls the API from the `web` container on every server render.
 * Both arrive as a container address, so the whole platform shared one bucket
 * and the 101st visitor in a minute was refused: a limit meant to curb one
 * abuser applied to everyone at once.
 *
 * The key is therefore the account id when there is one, and the forwarded
 * client address otherwise. The account id and not the session id: regenerate()
 * on login mints a new session for the same user, so keying on the session
 * would let anyone reset their own counter by signing in again.
 *
 * Routes marked @ThrottleByIp are the exception and stay on the address, since
 * identity is exactly what an attacker can multiply there.
 */
@Injectable()
export class IdentityThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Request): Promise<string> {
    // Checked before the session: a route guarding a secret must count every
    // attempt from one machine against one budget, whoever is signed in.
    if ((req as TrackedRequest)[BY_IP] === true) {
      return `ip:${this.clientAddress(req)}`;
    }

    // saveUninitialized is false, so an anonymous visitor carries no session.
    const userId = req.session?.userId;
    return userId === undefined ? `ip:${this.clientAddress(req)}` : `user:${userId}`;
  }

  /**
   * `trust proxy` is 1, so express skips the one trusted hop and resolves req.ip
   * to the right-most X-Forwarded-For entry: the address Caddy recorded for the
   * caller. That header is forgeable in general, and trustworthy here only
   * because Caddy is the sole ingress and rewrites it. Anything reaching the API
   * without passing through Caddy is internal traffic, which has no business
   * claiming a client address.
   */
  private clientAddress(req: Request): string {
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }

  /**
   * Resolves the route's tracking mode where the ExecutionContext is still in
   * hand, since getTracker below only receives the request.
   */
  protected override async handleRequest(request: ThrottlerRequest): Promise<boolean> {
    const { context } = request;

    // Assigned on every pass rather than only when true. handleRequest runs
    // once per configured throttler, and a flag that is only ever set would
    // leak from one throttler to the next within a single request.
    (this.getRequestResponse(context).req as TrackedRequest)[BY_IP] =
      this.reflector.getAllAndOverride<boolean>(THROTTLE_BY_IP, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    return super.handleRequest(request);
  }
}
