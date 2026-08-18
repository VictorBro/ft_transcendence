import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Marks a request that must be counted per address even when it carries a
 * session. Set by handleRequest and read back by getTracker, which receives
 * nothing but the request and so has no other way to learn what the route
 * asked for. Symbol-keyed to stay clear of anything express puts on req.
 */
const IP_ONLY = Symbol('identity-throttler:ip-only');

type TrackedRequest = Request & { [IP_ONLY]?: boolean };

/**
 * Counts requests per caller identity instead of per `req.ip`.
 *
 * The default tracker is wrong for this deployment, and not marginally so.
 * Nothing reaches the API from a client address: Caddy proxies browser traffic,
 * and Next.js calls the API server-side from the `web` container for every
 * requireUser() on a protected page. Both arrive as a container IP, so the
 * whole platform shared one 100/min bucket and the 101st visitor in a minute
 * was refused — a limit meant to curb one abuser applied to everyone at once.
 *
 * So the key is the account id when there is one, and the forwarded client
 * address otherwise. Note the account id and not the session id: regenerate()
 * on login mints a new session for the same user, and keying on it would let
 * anyone reset their own counter by signing in again.
 *
 * The limit itself is left alone. 100/min is the ceiling every caller gets,
 * signed in or not; the fix here was never that the number was too small, it
 * was that the number was being shared. Routes that set their own limit are
 * the exception and stay on the address, because identity is exactly what an
 * attacker can multiply there.
 */
@Injectable()
export class IdentityThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Request): Promise<string> {
    // Checked before the session, and returning straight away, because the
    // point is to ignore an identity the caller controls: a route that sets
    // its own limit is guarding a secret, and must count every attempt made
    // from one machine against one budget.
    if ((req as TrackedRequest)[IP_ONLY]) {
      return `ip:${this.clientAddress(req)}`;
    }

    // sessionID exists as soon as express-session parses a cookie it issued,
    // but an anonymous visitor gets no session at all (saveUninitialized is
    // false), so this is only set for callers that actually carry one.
    const userId = req.session?.userId;
    if (userId !== undefined) {
      return `user:${userId}`;
    }

    return `ip:${this.clientAddress(req)}`;
  }

  /**
   * `trust proxy` is set, so express has already reduced X-Forwarded-For to the
   * left-most client-supplied address in req.ip. That header is forgeable in
   * general; here it is trustworthy only because Caddy is the sole ingress and
   * rewrites it. Anything bypassing Caddy is internal traffic that has no
   * business claiming a client address.
   */
  private clientAddress(req: Request): string {
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }

  /**
   * Decides which requests are counted per address rather than per account.
   * signup, login and 2fa/verify all carry their own @Throttle and must keep
   * it counted per address: that is where brute-force protection lives.
   *
   * Metering those routes per account would hand the attacker the key to his
   * own bucket: sign in as one of N accounts he already controls and each one
   * opens a fresh 5/min budget against the same victim, so the limit reads 5
   * and behaves like 5N. Flagged here rather than in getTracker because this
   * is where the route's own limit is known, and super.handleRequest() below
   * is what calls getTracker.
   *
   * The override has to be detected through the reflector rather than by
   * comparing throttler.name, which is the name of the configured throttler
   * ("default") on every route, decorated or not, and so would quietly put
   * every route back on the address.
   */
  protected override async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, throttler } = requestProps;

    // Same reflector key and lookup order the base class uses to resolve a
    // route-level @Throttle, so "did a route set its own limit?" is answered
    // the same way here as there.
    const routeLimit = this.reflector.getAllAndOverride(`THROTTLER:LIMIT${throttler.name}`, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (routeLimit !== undefined) {
      const req = this.getRequestResponse(context).req as TrackedRequest;
      req[IP_ONLY] = true;
    }

    return super.handleRequest(requestProps);
  }
}
