import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        // Injected by class token. This resolves only if swc emitted
        // design:paramtypes, which is the whole point of vitest.config.ts.
        { provide: ConfigService, useValue: { get: () => '1.2.3' } },
      ],
    }).compile();

    service = moduleRef.get(HealthService);
  });

  it('reports the configured version', () => {
    expect(service.check()).toMatchObject({ status: 'ok', version: '1.2.3' });
  });

  it('reports uptime as a whole non-negative number of seconds', () => {
    const { uptime } = service.check();

    expect(uptime).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(uptime)).toBe(true);
  });
});
