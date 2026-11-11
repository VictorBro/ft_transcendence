import { test } from '@playwright/test';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Keeps the suite inside the signup and login rate limits instead of the limits
 * being raised to fit the suite.
 *
 * POST /auth/signup and POST /auth/login are limited per client address
 * (@ThrottleByIp on AuthController; SIGNUPS and LOGINS below must stay in step).
 * Every browser in the run reaches Caddy from the same address, so all workers
 * share each budget, and a run needs more accounts than the signup one holds.
 * Rather than let the workers race into a 429, each request first books a send
 * time from a log they all share, so no WINDOW_MS ever holds more than the
 * server allows.
 *
 * The logs outlive the run on purpose. The API remembers requests for a minute
 * whether or not Playwright restarted, so a second `make playwright` straight
 * after a first has to see what the first one spent. They live in the OS temp
 * directory rather than test-results/, which Playwright empties on every start.
 * Server 429s publish a shared cooldown as well: traffic outside this queue can
 * consume the same IP budget, and its Retry-After applies to every worker.
 */

/**
 * The throttler's 60s window plus slack. A slot is booked when the request is
 * due, but the server counts it when it arrives, and on a loaded runner that
 * can be a few seconds later. Five seconds costs a run about ten.
 */
const WINDOW_MS = 65_000;
const MAX_SETUP_ATTEMPTS = 3;

/** One rate-limited route: its per-address limit and the log its bookings share. */
export interface Budget {
  perWindow: number;
  log: string;
}

const SIGNUPS: Budget = { perWindow: 10, log: join(tmpdir(), 'ft-e2e-signups.json') };

/**
 * Only auth.spec.ts signs in through the form, three times per browser, so
 * three browsers run nine against a limit of five.
 */
const LOGINS: Budget = { perWindow: 5, log: join(tmpdir(), 'ft-e2e-logins.json') };

/** A lock held longer than this belongs to a worker that died holding it. */
const STALE_LOCK_MS = 5_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** mkdir is atomic: exactly one worker creates the directory, the rest retry. */
const withLock = async <T>(lock: string, body: () => Promise<T>): Promise<T> => {
  for (;;) {
    try {
      await mkdir(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
      const held = await stat(lock).catch(() => undefined);
      if (held !== undefined && Date.now() - held.mtimeMs > STALE_LOCK_MS) {
        await rm(lock, { recursive: true, force: true });
      } else {
        await sleep(20);
      }
    }
  }

  try {
    return await body();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
};

const readLog = async (log: string): Promise<number[]> => {
  try {
    const parsed: unknown = JSON.parse(await readFile(log, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((at) => typeof at === 'number') : [];
  } catch {
    // Missing on the first run, and a half-written file from a killed worker
    // is no worse than an empty one: the API will still say so with a 429.
    return [];
  }
};

const blockedUntil = async (log: string): Promise<number> => {
  const value = Number(await readFile(`${log}.cooldown`, 'utf8').catch(() => '0'));
  return Number.isFinite(value) ? value : 0;
};

/** Publish a server-imposed block to every worker, including workers already waiting. */
export const deferBudget = (budget: Budget, retryAfter: string | undefined): Promise<number> =>
  withLock(`${budget.log}.lock`, async () => {
    const now = Date.now();
    const seconds = retryAfter === undefined || retryAfter.trim() === '' ? NaN : Number(retryAfter);
    const date = Number.isFinite(seconds) ? NaN : Date.parse(retryAfter ?? '');
    const delay =
      Number.isFinite(seconds) && seconds >= 0
        ? seconds * 1000
        : Number.isFinite(date)
          ? Math.max(0, date - now)
          : WINDOW_MS;
    const until = Math.max(await blockedUntil(budget.log), now + delay + 1000);
    // Readers never see a partially written deadline.
    const temporary = `${budget.log}.cooldown.tmp`;
    await writeFile(temporary, `${until}`);
    await rename(temporary, `${budget.log}.cooldown`);
    return until;
  });

/**
 * Books the earliest send time that keeps every WINDOW_MS at or under the
 * limit. Booked times only ever grow, so the booking `perWindow` back is the
 * one a new request has to clear by a full window.
 */
const book = ({ perWindow, log }: Budget): Promise<number> =>
  withLock(`${log}.lock`, async () => {
    const now = Date.now();
    const booked = (await readLog(log)).filter((at) => at > now - WINDOW_MS).sort((a, b) => a - b);

    const blocking = booked.at(-perWindow);
    const slot = Math.max(
      now,
      await blockedUntil(log),
      booked.at(-1) ?? now,
      blocking === undefined ? now : blocking + WINDOW_MS,
    );

    await writeFile(log, JSON.stringify([...booked, slot]));
    return slot;
  });

export interface SlotOptions {
  /**
   * Off for worker fixtures. test.info() answers inside them too, but with the
   * test's timeout, and setTimeout() would replace the fixture's own budget
   * (WORKER_SIGNUP_TIMEOUT_MS) with that plus the wait.
   */
  extendTestTimeout?: boolean;
}

/** Waits for a booked slot, adding the wait to the running test's timeout unless told not to. */
export const waitForBudget = async (budget: Budget, { extendTestTimeout = true }: SlotOptions) => {
  for (;;) {
    const wait = (await book(budget)) - Date.now();
    if (wait > 0) {
      if (extendTestTimeout) {
        const info = test.info();
        // 0 means no timeout, which nothing needs extending.
        if (info.timeout > 0) info.setTimeout(info.timeout + wait);
      }
      await sleep(wait);
    }
    // A different request may have received a 429 after this slot was booked.
    if ((await blockedUntil(budget.log)) <= Date.now()) return;
  }
};

interface BudgetResponse {
  status(): number;
  headers(): Record<string, string>;
}

/** Only setup 429s are retried; application failures and UI assertions remain failures. */
export async function requestWithBudget<T extends BudgetResponse>(
  budget: Budget,
  send: () => Promise<T>,
  options: SlotOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    await waitForBudget(budget, options);
    const response = await send();
    if (response.status() !== 429) return response;
    await deferBudget(budget, response.headers()['retry-after']);
    if (attempt === MAX_SETUP_ATTEMPTS) return response;
  }
}

/** Use for API setup and ad hoc probes, which share the suite's client address. */
export const signUpRequest = <T extends BudgetResponse>(
  send: () => Promise<T>,
  options: SlotOptions = {},
) => requestWithBudget(SIGNUPS, send, options);

/**
 * Resolves when one more signup may be sent. Call it right before whatever
 * sends POST /auth/signup, whether that is a request or a click on the form.
 *
 * In a test or a test fixture the wait is added to the test's timeout, so a
 * test that queued behind other workers is not failed for it. A worker fixture
 * passes extendTestTimeout: false and sets WORKER_SIGNUP_TIMEOUT_MS instead,
 * which covers the longest wait.
 */
export const signUpSlot = (options: SlotOptions = {}): Promise<void> =>
  waitForBudget(SIGNUPS, options);

/** The same for POST /auth/login: call it right before clicking "Sign in". */
export const logInSlot = (): Promise<void> => waitForBudget(LOGINS, {});

/** Long enough for a worker fixture to queue for a slot and then sign up. */
export const WORKER_SIGNUP_TIMEOUT_MS = MAX_SETUP_ATTEMPTS * WINDOW_MS + 30_000;
