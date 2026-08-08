import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { HealthResponseSchema } from '@ft/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../prisma/prisma.service';
import { HealthService, SLOW_DEPENDENCY_MS } from './health.service';

async function buildService(ping: () => Promise<number>): Promise<HealthService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      HealthService,
      // Injected by class token. This resolves only if swc emitted
      // design:paramtypes, which is the whole point of vitest.config.mts.
      { provide: ConfigService, useValue: { get: () => '1.2.3' } },
      { provide: PrismaService, useValue: { ping } },
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

  it('is ok when the database answers quickly', async () => {
    await expect(service.check()).resolves.toMatchObject({
      status: 'ok',
      dependencies: [{ name: 'database', status: 'ok' }],
    });
  });

  it('is degraded when the database answers slowly', async () => {
    const slow = await buildService(() => Promise.resolve(SLOW_DEPENDENCY_MS + 1));

    await expect(slow.check()).resolves.toMatchObject({
      status: 'degraded',
      dependencies: [{ name: 'database', status: 'degraded' }],
    });
  });

  // The endpoint exists to report this case, so it must not become a 500.
  it('is down, without throwing, when the database probe rejects', async () => {
    const broken = await buildService(() => Promise.reject(new Error('ECONNREFUSED')));

    await expect(broken.check()).resolves.toMatchObject({
      status: 'down',
      dependencies: [{ name: 'database', status: 'down', latencyMs: 0 }],
    });
  });
});
