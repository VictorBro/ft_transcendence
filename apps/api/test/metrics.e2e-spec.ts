import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { httpRequestDuration, registry } from '../src/metrics/metrics';
import { seriesValue } from './metrics.fixtures';

/**
 * The HTTP metrics through the real Express pipeline, which the middleware's
 * own spec can only fake: the route template Nest leaves on the request, and
 * the status after the guards and ErrorCodeFilter. Prometheus scrapes them on
 * port 9464 (src/metrics/metrics-server.ts), which this suite never opens.
 */
describe('metrics (e2e)', () => {
  let app: INestApplication;

  const server = () => app.getHttpServer();
  const requests = (labels: Record<string, string | number>) =>
    seriesValue(httpRequestDuration, labels, '_count');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('counts a request under its route template, and never writes the URL', async () => {
    await request(server()).get('/api/courses/en/lessons/some-id?ref=mail').expect(401);

    expect(
      await requests({
        method: 'GET',
        route: '/api/courses/:lang/lessons/:id',
        status_code: 401,
      }),
    ).toBe(1);
    const scrape = await registry.metrics();
    expect(scrape).not.toContain('some-id');
    expect(scrape).not.toContain('ref=mail');
  });

  // One series however many paths a scanner tries.
  it('counts a path no route matched as unmatched', async () => {
    await request(server()).get('/api/nope').expect(404);
    await request(server()).get('/api/also-nope/42').expect(404);

    expect(await requests({ method: 'GET', route: 'unmatched', status_code: 404 })).toBe(2);
  });

  // The scrape lives on its own port, never behind caddy's /api route.
  it('serves no metrics at /api/metrics', async () => {
    const response = await request(server()).get('/api/metrics').expect(404);

    expect(response.text).not.toContain('http_request_duration_seconds');
  });

  it('collects the bank and the accounts at scrape time', async () => {
    const scrape = await registry.metrics();

    expect(scrape).toMatch(/^ft_users \d+$/m);
    expect(scrape).toMatch(/^ft_active_users \d+$/m);
    expect(scrape).toContain('ft_question_bank_questions{');
  });
});
