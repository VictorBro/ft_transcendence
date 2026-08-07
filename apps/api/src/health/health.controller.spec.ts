import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService, { provide: ConfigService, useValue: { get: () => '9.9.9' } }],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('returns the payload the Docker HEALTHCHECK expects', () => {
    expect(controller.check()).toEqual({
      status: 'ok',
      uptime: expect.any(Number),
      version: '9.9.9',
    });
  });
});
