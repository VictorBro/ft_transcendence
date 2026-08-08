import { afterEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from './prisma.service';

/**
 * No database here: the connection itself is exercised by the Supertest suite in
 * test/. What matters at this level is that the lifecycle hooks are wired to the
 * client at all, because a typo there fails at container start, not at compile
 * time.
 */
describe('PrismaService', () => {
  const service = new PrismaService();

  afterEach(() => {
    vi.restoreAllMocks();
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
});
