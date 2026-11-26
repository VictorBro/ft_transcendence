import { createServer } from 'node:net';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from './prisma.service';

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

/**
 * No database here: the connection itself is exercised by the Supertest suite in
 * test/. What matters at this level is that the lifecycle hooks are wired to the
 * client at all, because a typo there fails at container start, not at compile
 * time.
 */
describe('PrismaService', () => {
  const databaseUrl = 'postgresql://ft:ft_local_dev@db:5432/ft_transcendence?schema=public';
  let service: PrismaService;

  // Set explicitly rather than inherited from the shell: the constructor now
  // refuses to build without it, and a unit test should not depend on how it
  // was invoked.
  beforeEach(() => {
    process.env.DATABASE_URL = databaseUrl;
    service = new PrismaService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.DATABASE_URL = databaseUrl;
  });

  it('reaches the database during bootstrap rather than on the first query', async () => {
    const connect = vi.spyOn(service, '$connect').mockResolvedValue(undefined);
    const query = vi.spyOn(service, '$queryRaw').mockResolvedValue([{ '?column?': 1 }]);

    await service.onModuleInit();

    expect(connect).toHaveBeenCalledOnce();
    // $connect() only builds the pg pool; the query is what opens a connection.
    expect(query).toHaveBeenCalledOnce();
  });

  // No mock: a real pool against a port nothing listens on. Before #221 this
  // resolved, logged "database connected" and left the API listening.
  it('fails the start when DATABASE_URL points at nothing', async () => {
    const port = await closedPort();
    process.env.DATABASE_URL = `postgresql://ft:ft@127.0.0.1:${port}/ft?schema=public`;
    const unreachable = new PrismaService();

    try {
      await expect(unreachable.onModuleInit()).rejects.toThrow();
    } finally {
      await unreachable.onModuleDestroy();
    }
  });

  it('disconnects on shutdown', async () => {
    const disconnect = vi.spyOn(service, '$disconnect').mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('ping round-trips a trivial query and reports the latency', async () => {
    const query = vi.spyOn(service, '$queryRaw').mockResolvedValue([{ '?column?': 1 }]);

    const latency = await service.ping();

    expect(query).toHaveBeenCalledOnce();
    expect(latency).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(latency)).toBe(true);
  });

  it('lets a failing probe reject, so the caller decides what it means', async () => {
    vi.spyOn(service, '$queryRaw').mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.ping()).rejects.toThrow('ECONNREFUSED');
  });

  // Without this, node-postgres silently falls back to its PG* defaults and the
  // eventual error names localhost, in a container that never mentioned it.
  it.each([undefined, '', '   '])('refuses to construct with DATABASE_URL=%o', (value) => {
    if (value === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = value;
    }

    expect(() => new PrismaService()).toThrow(/DATABASE_URL is unset/);
  });
});
