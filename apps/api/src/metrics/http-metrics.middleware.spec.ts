import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { seriesValue } from '../../test/metrics.fixtures';
import { httpMetrics, methodOf, routeOf } from './http-metrics.middleware';
import { httpRequestDuration, httpRequestsInFlight, registry } from './metrics';

/**
 * Fakes, since express is not a dependency of this package: only the fields the
 * middleware reads. The real pipeline is covered by test/metrics.e2e-spec.ts.
 */
function exchange({
  method = 'GET',
  path,
  baseUrl = '',
  statusCode = 200,
  finished = true,
}: {
  method?: string;
  path?: string;
  baseUrl?: string;
  statusCode?: number;
  finished?: boolean;
} = {}) {
  const req = { method, baseUrl, route: path === undefined ? undefined : { path } };
  const res = Object.assign(new EventEmitter(), { statusCode, writableFinished: finished });
  return { req: req as unknown as Request, res: res as unknown as Response };
}

describe('httpMetrics', () => {
  beforeEach(() => registry.resetMetrics());

  it('times the request on close under its route template and final status', async () => {
    const { req, res } = exchange({ path: '/api/courses/:lang/lessons/:id' });
    const next = vi.fn();

    httpMetrics(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(await seriesValue(httpRequestsInFlight)).toBe(1);

    // Set late, as ErrorCodeFilter does: the close sees the final status.
    res.statusCode = 401;
    res.emit('close');

    expect(await seriesValue(httpRequestsInFlight)).toBe(0);
    const labels = { method: 'GET', route: '/api/courses/:lang/lessons/:id', status_code: 401 };
    expect(await seriesValue(httpRequestDuration, labels, '_count')).toBe(1);
  });

  it('records a reply the client left before it finished as 499', async () => {
    const { req, res } = exchange({ path: '/api/placement', finished: false });

    httpMetrics(req, res, vi.fn());
    res.emit('close');

    const labels = { method: 'GET', route: '/api/placement', status_code: 499 };
    expect(await seriesValue(httpRequestDuration, labels, '_count')).toBe(1);
  });

  // Aborted while the session middleware waited on Redis: the status is still
  // the default 200, which must not pass for an avatar.
  it('records a request the client left before any route matched as unmatched', async () => {
    const { req, res } = exchange({ finished: false });

    httpMetrics(req, res, vi.fn());
    res.emit('close');

    const labels = { method: 'GET', route: 'unmatched', status_code: 499 };
    expect(await seriesValue(httpRequestDuration, labels, '_count')).toBe(1);
  });

  it('counts a request once, even if close fires twice', async () => {
    const { req, res } = exchange({ path: '/api/health' });

    httpMetrics(req, res, vi.fn());
    res.emit('close');
    res.emit('close');

    expect(await seriesValue(httpRequestsInFlight)).toBe(0);
    const labels = { method: 'GET', route: '/api/health', status_code: 200 };
    expect(await seriesValue(httpRequestDuration, labels, '_count')).toBe(1);
  });

  describe('routeOf', () => {
    it.each([
      ['with', '/api/v2', '/users/:id', '/api/v2/users/:id'],
      ['without', '', '/api/users/:id', '/api/users/:id'],
    ])('gives the matched template, %s a router mount path', (_, baseUrl, path, route) => {
      const { req } = exchange({ baseUrl, path });

      expect(routeOf(req, 200)).toBe(route);
    });

    // An avatar from express.static has no route, and an unknown path is one
    // series however many paths a scanner tries.
    it.each([
      [200, 'static'],
      [304, 'static'],
      [400, 'unmatched'],
      [404, 'unmatched'],
      [413, 'unmatched'],
      [499, 'unmatched'],
    ])('gives a request no route matched, answered %i, as %s', (status, route) => {
      expect(routeOf(exchange().req, status)).toBe(route);
    });
  });

  describe('methodOf', () => {
    it.each(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('keeps %s', (method) => {
      expect(methodOf(exchange({ method }).req)).toBe(method);
    });

    it.each(['PROPFIND', 'MKCOL', 'PURGE'])('turns %s into OTHER', (method) => {
      expect(methodOf(exchange({ method }).req)).toBe('OTHER');
    });
  });
});
