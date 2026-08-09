import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthResponseSchema } from '@ft/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health answers the shape @ft/shared publishes', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    // Parsed against the published schema rather than compared field by field,
    // so the assertion fails on a contract break rather than on a new field.
    const parsed = HealthResponseSchema.safeParse(response.body);
    expect(parsed.error?.issues ?? []).toEqual([]);

    // A real database backs this suite here and in CI, so a down dependency is
    // a genuine failure, not an environment difference.
    expect(response.body).toMatchObject({
      status: 'ok',
      dependencies: [
        { name: 'database', status: 'ok' },
        { name: 'redis', status: 'ok' },
      ],
    });
  });

  it('GET /api/hello', async () => {
    const response = await request(app.getHttpServer()).get('/api/hello').expect(200);

    expect(response.body).toEqual({ message: 'Hello from @ft/api' });
  });

  it('serves the OpenAPI document at /api/docs', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

    expect(response.body.paths).toHaveProperty('/api/health');
  });
});
