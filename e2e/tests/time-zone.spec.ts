import type { Request } from '@playwright/test';

import { expect, ONBOARDED_COURSE, placeCourse, test } from '../support/session';

const home = `/en/learn/${ONBOARDED_COURSE.lang}`;

const isProfilePatch = (request: Request) =>
  request.method() === 'PATCH' && new URL(request.url()).pathname === '/api/users/me';

test.describe('time zone sync', () => {
  // Anything but the UTC every other spec runs in, so the new account differs.
  test.use({ timezoneId: 'Pacific/Honolulu' });

  test('stores the browser zone once, then never again', async ({ freshLearner: page }) => {
    // Through the API, so the first page under the course shell is the visit below.
    await placeCourse(page, ONBOARDED_COURSE);

    let patches = 0;
    page.on('request', (request) => {
      if (isProfilePatch(request)) patches += 1;
    });

    const patched = page.waitForResponse((response) => isProfilePatch(response.request()));
    await page.goto(home);
    expect((await patched).status()).toBe(200);
    // Lets the router.refresh() land: a second PATCH would come after it.
    await page.waitForLoadState('networkidle');
    expect(patches).toBe(1);

    const me = await page.request.get('/api/auth/me');
    expect((await me.json()).timeZone).toBe('Pacific/Honolulu');

    await page.goto(home);
    await page.waitForLoadState('networkidle');
    expect(patches).toBe(1);
  });
});
