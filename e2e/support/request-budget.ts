import type { APIResponse, TestInfo } from '@playwright/test';

/**
 * Keeps a test on a shared account inside the API's per-account rate limit
 * (RATE_LIMIT_PER_MINUTE, 100 by default) rather than racing into a 429.
 *
 * The onboarded account is worker-scoped, so every test of a worker spends
 * from one budget. A placement test answers up to 30 questions through the
 * API, then renders pages whose server calls count too: two in the same
 * minute can empty it, and the next page render fails with "Could not load
 * the courses: the API answered HTTP 429".
 *
 * The throttler names what is left on every response: X-RateLimit-Remaining,
 * and X-RateLimit-Reset, the seconds before the window starts again. With
 * less left than the test needs, this waits for that window, and gives the
 * test the same time on top of its timeout.
 */
export async function keepRequestBudget(
  response: APIResponse,
  needed: number,
  testInfo: TestInfo,
): Promise<void> {
  const headers = response.headers();
  const remaining = Number(headers['x-ratelimit-remaining']);
  const reset = Number(headers['x-ratelimit-reset']);
  // No headers (a route that skips the throttler): nothing to go by.
  if (!Number.isFinite(remaining) || !Number.isFinite(reset) || remaining >= needed) return;
  // One second on top: the window is counted in whole seconds.
  const waitMs = (reset + 1) * 1000;
  testInfo.setTimeout(testInfo.timeout + waitMs);
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}
