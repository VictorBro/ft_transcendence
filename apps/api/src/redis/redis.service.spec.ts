import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RedisService } from './redis.service';

/**
 * The connection itself is exercised by the Supertest suite. What matters here
 * is that the lifecycle hooks reach the client, because a mistake there fails
 * at container start rather than at compile time.
 */
describe('RedisService', () => {
  const url = 'redis://redis:6379';
  let service: RedisService;

  beforeEach(() => {
    process.env.REDIS_URL = url;
    service = new RedisService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.REDIS_URL = url;
  });

  it('connects on module init', async () => {
    const connect = vi.spyOn(service.client, 'connect').mockResolvedValue(undefined as never);

    await service.onModuleInit();

    expect(connect).toHaveBeenCalledOnce();
  });

  it('closes on shutdown', async () => {
    const close = vi.spyOn(service.client, 'close').mockResolvedValue(undefined as never);

    await service.onModuleDestroy();

    expect(close).toHaveBeenCalledOnce();
  });

  it('ping reports a finite latency', async () => {
    const ping = vi.spyOn(service.client, 'ping').mockResolvedValue('PONG' as never);

    const latency = await service.ping();

    expect(ping).toHaveBeenCalledOnce();
    expect(Number.isFinite(latency)).toBe(true);
    expect(latency).toBeGreaterThanOrEqual(0);
  });

  it('lets a failing ping reject, so health decides what it means', async () => {
    vi.spyOn(service.client, 'ping').mockRejectedValue(new Error('ECONNREFUSED') as never);

    await expect(service.ping()).rejects.toThrow('ECONNREFUSED');
  });

  // Same reasoning as DATABASE_URL: without this the client silently targets
  // localhost and the failure names a host nobody configured.
  it.each([undefined, '', '   '])('refuses to construct with REDIS_URL=%o', (value) => {
    if (value === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = value;
    }

    expect(() => new RedisService()).toThrow(/REDIS_URL is unset/);
  });
});
