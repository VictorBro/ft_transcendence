import type { NextFunction, Request, Response } from 'express';

import { httpRequestDuration, httpRequestsInFlight } from './metrics';

/**
 * A middleware, not an interceptor: interceptors run after guards, so they
 * would never see the 401s, the 429s, unknown routes or body parser errors.
 * Timed on `close`, after ErrorCodeFilter has set the final status.
 */
export function httpMetrics(req: Request, res: Response, next: NextFunction): void {
  const stop = httpRequestDuration.startTimer({ method: methodOf(req) });
  httpRequestsInFlight.inc();
  res.once('close', () => {
    httpRequestsInFlight.dec();
    // 499: the client left before the reply finished.
    const status = res.writableFinished ? res.statusCode : 499;
    stop({ route: routeOf(req, status), status_code: status });
  });
  next();
}

/** The template, never the URL: ids and query strings would make a series per request. */
export function routeOf(req: Request, status: number): string {
  if (req.route?.path) return `${req.baseUrl ?? ''}${req.route.path}`;
  // No route: an avatar from express.static, or a request nothing handled. An
  // abort before routing (499) is unmatched, whatever the default 200 said.
  return status < 400 ? 'static' : 'unmatched';
}

const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

/** Node parses about 30 methods and anyone can send PROPFIND. Same bucket as Caddy's. */
export function methodOf(req: Request): string {
  return METHODS.has(req.method) ? req.method : 'OTHER';
}
