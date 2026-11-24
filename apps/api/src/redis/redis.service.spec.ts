import { createServer } from 'node:net';

import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reconnectDelayMs, RedisService } from './redis.service';

/** A port that was free a moment ago and now refuses connections. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (address === null || typeof address === 'string') {
    throw new Error('expected a TCP address');
  }
  return address.port;
}

function reconnectStrategy(service: RedisService) {
  const strategy = service.client.options?.socket?.reconnectStrategy;
  if (typeof strategy !== 'function') {
    throw new Error('expected a reconnect strategy function');
  }
  return strategy;
}

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

  // No mock: a real client against a port nothing listens on. Before #221 the
  // default strategy retried forever, so this promise never settled and the
  // API hung before listening.
  it('fails the start when REDIS_URL points at nothing', async () => {
    const port = await closedPort();
    process.env.REDIS_URL = `redis://127.0.0.1:${port}`;
    const unreachable = new RedisService();
    // The client also emits each failure; the service's listener only logs it.
    vi.spyOn(Logger.prototype, 'error').mockReturnValue();

    await expect(unreachable.onModuleInit()).rejects.toThrow(/first connect failed/);
  });

  it('gives up before the first connect, then keeps reconnecting after it', async () => {
    vi.spyOn(service.client, 'connect').mockResolvedValue(undefined as never);
    const strategy = reconnectStrategy(service);

    expect(strategy(0, new Error('ECONNREFUSED'))).toBeInstanceOf(Error);

    await service.onModuleInit();

    expect(typeof strategy(0, new Error('ECONNRESET'))).toBe('number');
  });

  it('backs off from 50 ms up to 2 s, with under 200 ms of jitter', () => {
    expect(reconnectDelayMs(0)).toBeGreaterThanOrEqual(50);
    expect(reconnectDelayMs(0)).toBeLessThan(250);
    expect(reconnectDelayMs(20)).toBeGreaterThanOrEqual(2_000);
    expect(reconnectDelayMs(20)).toBeLessThan(2_200);
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
