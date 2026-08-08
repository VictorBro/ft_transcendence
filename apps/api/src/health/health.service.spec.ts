import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { HealthResponseSchema } from '@ft/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { HealthService, SLOW_DEPENDENCY_MS } from './health.service';

async function buildService(
  ping: () => Promise<number>,
  redisPing: () => Promise<number> = ping,
): Promise<HealthService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      HealthService,
      // Injected by class token. This resolves only if swc emitted
      // design:paramtypes, which is the whole point of vitest.config.mts.
      { provide: ConfigService, useValue: { get: () => '1.2.3' } },
      { provide: PrismaService, useValue: { ping } },
      { provide: RedisService, useValue: { ping: redisPing } },
    ],
  }).compile();

  return moduleRef.get(HealthService);
}

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    service = await buildService(() => Promise.resolve(1));
  });

  it('reports the configured version and its own service name', async () => {
    await expect(service.check()).resolves.toMatchObject({ version: '1.2.3', service: 'api' });
  });

  it('reports uptime as a whole non-negative number of seconds', async () => {
    const { uptimeSeconds } = await service.check();

    expect(uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(uptimeSeconds)).toBe(true);
  });

  // The response is a published contract, not just a shape this file agrees
  // with: parsing it here is what stops the API and the frontend drifting.
  it('emits a payload @ft/shared accepts', async () => {
    expect(HealthResponseSchema.safeParse(await service.check()).success).toBe(true);
  });

  it('reports every dependency, both ok, when they answer quickly', async () => {
    await expect(service.check()).resolves.toMatchObject({
      status: 'ok',
      dependencies: [
        { name: 'database', status: 'ok' },
        { name: 'redis', status: 'ok' },
      ],
    });
  });

  it('is degraded when one dependency answers slowly', async () => {
    const slow = await buildService(
      () => Promise.resolve(SLOW_DEPENDENCY_MS + 1),
      () => Promise.resolve(1),
    );

    await expect(slow.check()).resolves.toMatchObject({
      status: 'degraded',
      dependencies: [
        { name: 'database', status: 'degraded' },
        { name: 'redis', status: 'ok' },
      ],
    });
  });

  // The endpoint exists to report this case, so it must not become a 500.
  it('is down, without throwing, when a probe rejects', async () => {
    const broken = await buildService(
      () => Promise.reject(new Error('ECONNREFUSED')),
      () => Promise.resolve(1),
    );

    await expect(broken.check()).resolves.toMatchObject({
      status: 'down',
      dependencies: [
        { name: 'database', status: 'down', latencyMs: 0 },
        { name: 'redis', status: 'ok' },
      ],
    });
  });

  // Worst dependency wins: a healthy database must not mask a dead cache.
  it('is down when only redis is down', async () => {
    const brokenRedis = await buildService(
      () => Promise.resolve(1),
      () => Promise.reject(new Error('ECONNREFUSED')),
    );

    await expect(brokenRedis.check()).resolves.toMatchObject({
      status: 'down',
      dependencies: [
        { name: 'database', status: 'ok' },
        { name: 'redis', status: 'down' },
      ],
    });
  });
});
