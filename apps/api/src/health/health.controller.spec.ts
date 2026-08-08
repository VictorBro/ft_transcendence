import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { HealthResponseSchema } from '@ft/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: ConfigService, useValue: { get: () => '9.9.9' } },
        { provide: PrismaService, useValue: { ping: () => Promise.resolve(1) } },
        { provide: RedisService, useValue: { ping: () => Promise.resolve(1) } },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('returns a payload matching the published contract', async () => {
    const body = await controller.check();

    expect(HealthResponseSchema.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ status: 'ok', version: '9.9.9', service: 'api' });
  });
});
