import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Per-session quota. Far larger than the anonymous one because a session is
 * attributable and revocable: it belongs to one account, that account's traffic
 * is counted on its own key, and abuse can be answered by destroying the
 * session rather than by keeping every signed-in user on a short leash.
 *
 * Sized off page loads, not API calls: every server-rendered protected page
 * costs one /api/auth/me, so a burst of navigation adds up quickly and legibly.
 */
export const SESSION_THROTTLE_LIMIT = 600;

/**
 * Counts requests per caller identity instead of per `req.ip`.
 *
 * The default tracker is wrong for this deployment, and not marginally so.
 * Nothing reaches the API from a client address: Caddy proxies browser traffic,
 * and Next.js calls the API server-side from the `web` container for every
 * requireUser() on a protected page. Both arrive as a container IP, so the
 * whole platform shares one 100/min bucket and the 101st visitor in a minute is
 * signed out — fetchSession() maps any non-ok response to null, which
 * requireUser() cannot distinguish from "signed out" and answers with a
 * redirect to /login.
 *
 * So the key is the session id when there is one, and the forwarded client
 * address otherwise. Authenticated traffic is metered per account; anonymous
 * traffic keeps the per-IP limit it has today.
 */
@Injectable()
export class IdentityThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Request): Promise<string> {
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
   * Raises the ceiling for signed-in callers, and only where no route asked for
   * something stricter. signup, login and 2fa/verify all carry their own
   * @Throttle and must keep it: that is where brute-force protection lives.
   *
   * The override has to be detected through the reflector rather than by
   * comparing throttler.name, which is the name of the configured throttler
   * ("default") on every route, decorated or not, and so would quietly lift the
   * limit on exactly the endpoints that need it lowest.
   */
  protected override async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, throttler } = requestProps;
    const req = this.getRequestResponse(context).req as Request;

    // Same reflector key and lookup order the base class uses to resolve a
    // route-level @Throttle, so "did a route set its own limit?" is answered
    // the same way here as there.
    const routeLimit = this.reflector.getAllAndOverride(`THROTTLER:LIMIT${throttler.name}`, [
      context.getHandler(),
      context.getClass(),
    ]);

    const hasSession = req.session?.userId !== undefined;
    if (hasSession && routeLimit === undefined) {
      return super.handleRequest({ ...requestProps, limit: SESSION_THROTTLE_LIMIT });
    }

    return super.handleRequest(requestProps);
  }
}
