import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * The monitoring module's security surface, through Caddy: Grafana is the one
 * monitoring service anyone outside the compose network can reach, and only
 * behind its own login. Prometheus, Alertmanager and every metrics endpoint
 * stay internal. docs/MONITORING.md lists what is exposed and why.
 */

const DASHBOARD_UIDS = ['ft-overview', 'ft-api', 'ft-learning', 'ft-infrastructure'];

test.describe('monitoring, anonymous', () => {
  test('Grafana answers through Caddy', async ({ request }) => {
    const response = await request.get('/grafana/api/health');

    expect(response.status(), 'Grafana is not reachable at /grafana').toBe(200);
    expect(await response.json()).toMatchObject({ database: 'ok' });
  });

  test('an anonymous visitor only gets the login page', async ({ page }) => {
    await page.goto('/grafana/');

    await expect(page).toHaveURL(/\/grafana\/login$/);
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /sign up/i })).toHaveCount(0);
  });

  test('the Grafana API refuses anonymous reads', async ({ request }) => {
    expect((await request.get('/grafana/api/search')).status()).toBe(401);
  });

  test('sign-up is off', async ({ request }) => {
    const response = await request.post('/grafana/api/user/signup/step1', {
      data: { email: 'browser-grafana-signup@example.com' },
    });

    expect(response.ok(), 'Grafana accepted a sign-up').toBe(false);
  });

  test('metrics endpoints stay internal', async ({ request }) => {
    // The api serves its metrics on its own port, outside the /api prefix.
    expect((await request.get('/api/metrics')).status()).toBe(404);
    // Off in grafana.ini and refused by Caddy, so a slip in one is not enough.
    expect((await request.get('/grafana/metrics')).status()).toBe(404);
    // Anything else falls through to web, which must not serve any either.
    expect(await (await request.get('/metrics')).text()).not.toContain('# HELP');
  });
});

/**
 * Logged in as admin over HTTP Basic, which Grafana checks against the same
 * password and the same lockout as the login form.
 *
 * Serial, and the first test stops the rest: five wrong passwords lock the
 * runner's IP out for five minutes, so a mismatch costs one attempt, not one
 * per test.
 */
test.describe.serial('monitoring, as the Grafana admin', () => {
  let authorization = '';

  const get = (request: APIRequestContext, path: string) =>
    request.get(path, { headers: { authorization } });

  /** One PromQL query through Grafana's datasource proxy: the path the dashboards use. */
  const query = async (request: APIRequestContext, promql: string): Promise<string[]> => {
    const response = await get(
      request,
      `/grafana/api/datasources/proxy/uid/prometheus/api/v1/query?query=${encodeURIComponent(promql)}`,
    );
    if (!response.ok()) return [];
    const body = (await response.json()) as { data?: { result?: { value: [number, string] }[] } };
    return (body.data?.result ?? []).map((sample) => sample.value[1]);
  };

  test.beforeAll(() => {
    const password = process.env.GRAFANA_ADMIN_PASSWORD;
    if (!password) {
      throw new Error(
        'GRAFANA_ADMIN_PASSWORD is not set. `make` reads it from the running grafana container; in CI it comes from e2e.yml.',
      );
    }
    authorization = `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`;
  });

  test('the admin password is the one Grafana has', async ({ request }) => {
    const response = await get(request, '/grafana/api/user');

    expect(
      response.status(),
      'GRAFANA_ADMIN_PASSWORD in .env does not match grafana-data: reset it, see docs/MONITORING.md',
    ).toBe(200);
  });

  test('the four dashboards are provisioned', async ({ request }) => {
    const response = await get(request, '/grafana/api/search?type=dash-db');

    expect(response.status()).toBe(200);
    const uids = ((await response.json()) as { uid: string }[]).map((dashboard) => dashboard.uid);
    expect(uids).toEqual(expect.arrayContaining(DASHBOARD_UIDS));
  });

  test('Prometheus feeds Grafana', async ({ request }) => {
    // `make test-e2e` can start the suite before the first scrape: Prometheus
    // scrapes every 30 s and the bank gauge is cached for 60 s.
    test.setTimeout(120_000);
    const poll = { timeout: 100_000, intervals: [5_000] };
    // sum, not count: the api reports every cell, empty ones at 0, before the seed.
    const bankSize = async () =>
      Number((await query(request, 'sum(ft_question_bank_questions)'))[0] ?? 0);

    await expect
      .poll(() => query(request, 'up{job="api"}'), { ...poll, message: 'the api target is not up' })
      .toEqual(['1']);
    await expect
      .poll(bankSize, {
        ...poll,
        message: 'the question bank is empty or not scraped: did the seed run?',
      })
      .toBeGreaterThan(0);
  });
});
