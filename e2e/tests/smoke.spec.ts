import { expect, test } from '@playwright/test';

import { JSON_ROUTES } from '../support/routes';

/**
 * Proves the shipped topology, not the UI: one TLS origin, Caddy routing /api
 * to NestJS and everything else to Next, and the two runtimes talking to each
 * other over the internal network.
 */
test.describe('production stack smoke', () => {
  test('home page renders and reports a reachable API', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // The badge is server-rendered from a real call to http://api:3001 inside
    // the compose network, so "connected" is an end-to-end assertion: web can
    // resolve and reach api. "unavailable" means the wiring is broken even
    // though the page itself renders.
    await expect(page.getByText('connected', { exact: true })).toBeVisible();
    await expect(page.getByText('Hello from @ft/api')).toBeVisible();
  });

  for (const route of JSON_ROUTES) {
    test(`${route.name} (${route.path}) answers 200 JSON`, async ({ request }) => {
      const response = await request.get(route.path);

      expect(response.status(), `${route.path} did not return 200`).toBe(200);
      expect(response.headers()['content-type']).toContain('application/json');

      const body: unknown = await response.json();
      expect(body).toBeTruthy();
    });
  }

  test('health endpoints report ok', async ({ request }) => {
    expect(await (await request.get('/healthz')).json()).toEqual({
      status: 'ok',
      service: 'web',
    });

    // Against the production stack the database is up, so this is the one place
    // that asserts a genuinely healthy dependency rather than just a valid shape.
    expect(await (await request.get('/api/health')).json()).toEqual({
      status: 'ok',
      service: 'api',
      version: expect.any(String),
      uptimeSeconds: expect.any(Number),
      checkedAt: expect.any(String),
      dependencies: [
        { name: 'database', status: 'ok', latencyMs: expect.any(Number) },
        { name: 'redis', status: 'ok', latencyMs: expect.any(Number) },
      ],
    });
  });

  test('the OpenAPI document is served behind the same origin', async ({ request }) => {
    const response = await request.get('/api/docs-json');

    expect(response.status()).toBe(200);
    const document = (await response.json()) as { paths?: Record<string, unknown> };
    expect(document.paths).toHaveProperty('/api/health');
  });

  test('Caddy applies the security headers and hides its own banner', async ({ request }) => {
    const headers = (await request.get('/')).headers();

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toContain('camera=()');
    expect(headers.server).toBeUndefined();
  });

  test('an unknown path returns 404 rather than the home page', async ({ request }) => {
    const response = await request.get('/this-route-does-not-exist');

    expect(response.status()).toBe(404);
  });
});
