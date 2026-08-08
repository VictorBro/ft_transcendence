import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from './prisma.service';

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

  it('connects during bootstrap rather than on the first query', async () => {
    const connect = vi.spyOn(service, '$connect').mockResolvedValue(undefined);

    await service.onModuleInit();

    expect(connect).toHaveBeenCalledOnce();
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
