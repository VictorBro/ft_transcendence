import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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

  it('GET /api/health', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      uptime: expect.any(Number),
      version: expect.any(String),
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
