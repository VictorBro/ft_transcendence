import { test } from '@playwright/test';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Keeps the suite inside the signup rate limit instead of the limit being
 * raised to fit the suite.
 *
 * POST /auth/signup allows SIGNUPS_PER_WINDOW a minute per client address
 * (@ThrottleByIp on AuthController.signUp; keep the two in step). Every browser
 * in the run reaches Caddy from the same address, so all workers share that one
 * budget, and a run needs more accounts than it holds. Rather than let the
 * workers race into a 429, each signup first books a send time from a log they
 * all share, so no WINDOW_MS ever holds more than the server allows.
 *
 * The log outlives the run on purpose. The API remembers signups for a minute
 * whether or not Playwright restarted, so a second `make playwright` straight
 * after a first has to see what the first one spent. It lives in the OS temp
 * directory rather than test-results/, which Playwright empties on every start.
 */

const SIGNUPS_PER_WINDOW = 10;

/**
 * The throttler's window plus slack for the time between booking a slot and
 * the request reaching the API, which is what the server actually counts.
 */
const WINDOW_MS = 61_000;

const LOG = join(tmpdir(), 'ft-e2e-signups.json');
const LOCK = `${LOG}.lock`;

/** A lock held longer than this belongs to a worker that died holding it. */
const STALE_LOCK_MS = 5_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** mkdir is atomic: exactly one worker creates the directory, the rest retry. */
const withLock = async <T>(body: () => Promise<T>): Promise<T> => {
  for (;;) {
    try {
      await mkdir(LOCK);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
      const held = await stat(LOCK).catch(() => undefined);
      if (held !== undefined && Date.now() - held.mtimeMs > STALE_LOCK_MS) {
        await rm(LOCK, { recursive: true, force: true });
      } else {
        await sleep(20);
      }
    }
  }

  try {
    return await body();
  } finally {
    await rm(LOCK, { recursive: true, force: true });
  }
};

const readLog = async (): Promise<number[]> => {
  try {
    const parsed: unknown = JSON.parse(await readFile(LOG, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((at) => typeof at === 'number') : [];
  } catch {
    // Missing on the first run, and a half-written file from a killed worker
    // is no worse than an empty one: the API will still say so with a 429.
    return [];
  }
};

/**
 * Books the earliest send time that keeps every WINDOW_MS at or under the
 * limit. Booked times only ever grow, so the booking SIGNUPS_PER_WINDOW back is
 * the one a new signup has to clear by a full window.
 */
const book = (): Promise<number> =>
  withLock(async () => {
    const now = Date.now();
    const booked = (await readLog()).filter((at) => at > now - WINDOW_MS).sort((a, b) => a - b);

    const blocking = booked.at(-SIGNUPS_PER_WINDOW);
    const slot = Math.max(
      now,
      booked.at(-1) ?? now,
      blocking === undefined ? now : blocking + WINDOW_MS,
    );

    await writeFile(LOG, JSON.stringify([...booked, slot]));
    return slot;
  });

/**
 * Resolves when one more signup may be sent. Call it right before whatever
 * sends POST /auth/signup, whether that is a request or a click on the form.
 *
 * The wait is added to the running test's timeout, so a test that queued
 * behind other workers is not failed for it. Worker fixtures have no running
 * test; they set a timeout of their own that covers the longest wait.
 */
export const signUpSlot = async (): Promise<void> => {
  const wait = (await book()) - Date.now();
  if (wait <= 0) {
    return;
  }

  try {
    const info = test.info();
    // 0 means no timeout, which nothing needs extending.
    if (info.timeout > 0) {
      info.setTimeout(info.timeout + wait);
    }
  } catch {
    // Not inside a test: a worker fixture, covered by its own timeout.
  }
  await sleep(wait);
};

/** Long enough for a worker fixture to queue for a slot and then sign up. */
export const WORKER_SIGNUP_TIMEOUT_MS = WINDOW_MS + 30_000;
