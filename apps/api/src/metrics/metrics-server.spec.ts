import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appInfo, registry } from './metrics';
import { startMetricsServer } from './metrics-server';

describe('startMetricsServer', () => {
  const servers: Server[] = [];
  let base: string;

  // Port 0: whatever is free, so the spec never fights a running API for 9464.
  beforeEach(async () => {
    registry.resetMetrics();
    const server = await startMetricsServer(0);
    servers.push(server);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
      servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
    );
  });

  it('serves the registry at GET /metrics, in the format Prometheus asks for', async () => {
    appInfo.set({ version: '1.2.3' }, 1);

    const response = await fetch(`${base}/metrics`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(registry.contentType);
    expect(await response.text()).toContain('ft_app_info{version="1.2.3"} 1');
  });

  it.each([
    ['another path', '/', 'GET'],
    ['a path under it', '/metrics/x', 'GET'],
    ['another method', '/metrics', 'POST'],
  ])('answers 404 to %s', async (_, path, method) => {
    const response = await fetch(`${base}${path}`, { method });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });

  it('answers 500 when the registry cannot be read', async () => {
    vi.spyOn(registry, 'metrics').mockRejectedValueOnce(new Error('boom'));

    const response = await fetch(`${base}/metrics`);

    expect(response.status).toBe(500);
  });

  // main.ts logs this instead of crashing the API.
  it('rejects when the port is taken', async () => {
    const port = Number(new URL(base).port);

    await expect(startMetricsServer(port)).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });
});
