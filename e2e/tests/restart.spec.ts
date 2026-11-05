import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { formatViolations, settle, watchConsole } from '../support/console-guard';
import { liveConnection } from '../support/live';
import { expect, placeCourse, SECOND_COURSE, test } from '../support/session';

/**
 * A real API restart under an open page. It takes the API from every test
 * beside it and from SSR, so it never runs in the suite: E2E_RESTART=1 runs it
 * alone, after the suite (playwright.config.ts).
 */

// From the repo root, so compose finds the project, COMPOSE_PROJECT_NAME and
// COMPOSE_FILE included.
const REPO_ROOT = path.resolve(__dirname, '../..');
const run = promisify(execFile);

const course = `/en/learn/${SECOND_COURSE.lang}`;

test(
  'an open page reconnects after an API restart, silently',
  { tag: '@restart' },
  async ({ onboarded, browserName }) => {
    // Two API starts in 15 minutes fire ApiRestarting, so one engine restarts it.
    // The retry loop is the same code on all three; Firefox and WebKit by hand.
    test.skip(browserName !== 'chromium', 'one restart a run, on Chromium');
    test.setTimeout(120_000);

    await placeCourse(onboarded, SECOND_COURSE);
    const violations = watchConsole(onboarded);
    const first = liveConnection(onboarded);
    await onboarded.goto(course);
    await first;

    // Armed before the old socket drops, so the new one cannot go by unseen.
    const back = liveConnection(onboarded, 90_000);
    // --no-deps: the api alone. caddy and web depend on it, and the page's
    // probe goes through both.
    await Promise.all([
      run('docker', ['compose', 'restart', '--no-deps', 'api'], { cwd: REPO_ROOT }),
      expect(onboarded.getByText('Reconnecting…')).toBeVisible({ timeout: 20_000 }),
    ]);
    // A new socket in the room, not just a quiet page.
    await back;
    await expect(onboarded.getByText('Reconnecting…')).toBeHidden();
    // A signed-out header would hide the badge too.
    await expect(onboarded.getByRole('button', { name: 'Sign out' })).toBeVisible();

    // After the refresh that coming back makes, so only the event can bring the value.
    await settle(onboarded);
    const saved = await onboarded.request.patch(`/api/courses/${SECOND_COURSE.lang}`, {
      data: { dailyGoal: 60 },
    });
    expect(saved.status()).toBe(200);
    await expect(onboarded.getByRole('combobox', { name: 'Daily goal' })).toHaveValue('60');

    await settle(onboarded);
    expect(violations, `the restart logged:\n${formatViolations(violations)}\n`).toEqual([]);
  },
);
