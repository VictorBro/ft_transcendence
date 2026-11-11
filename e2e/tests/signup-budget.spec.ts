import { test as base, expect } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  deferBudget,
  requestWithBudget,
  waitForBudget,
  type Budget,
} from '../support/signup-budget';

// Independent files: these tests never spend the live stack's signup budget.
const test = base.extend<{ budget: Budget }>({
  budget: async ({ browserName }, use) => {
    const directory = await mkdtemp(join(tmpdir(), `ft-budget-${browserName}-`));
    try {
      await use({ perWindow: 10, log: join(directory, 'bookings.json') });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
});
const options = { extendTestTimeout: false };
const response = (status: number) => ({
  status: () => status,
  headers: () => ({ 'retry-after': '0' }),
});

test('a new server cooldown also postpones workers with previously booked slots', async ({
  budget,
}) => {
  await deferBudget(budget, '2');
  const workers = [0, 1].map(() => waitForBudget(budget, options).then(() => Date.now()));
  try {
    await expect
      .poll(async () =>
        readFile(budget.log, 'utf8')
          .then((raw) => JSON.parse(raw).length as number)
          .catch(() => 0),
      )
      .toBe(2);
    const deadline = await deferBudget(budget, '3');
    for (const sentAt of await Promise.all(workers))
      expect(sentAt).toBeGreaterThanOrEqual(deadline);
  } finally {
    await Promise.allSettled(workers);
  }
});

test('setup waits out a 429 and then succeeds', async ({ budget }) => {
  const sends: number[] = [];
  const result = await requestWithBudget(
    budget,
    async () => {
      sends.push(Date.now());
      return response(sends.length === 1 ? 429 : 201);
    },
    options,
  );
  expect(result.status()).toBe(201);
  expect(sends).toHaveLength(2);
  const deadline = Number(await readFile(`${budget.log}.cooldown`, 'utf8'));
  expect(sends[1]).toBeGreaterThanOrEqual(deadline);
});

test('setup stops after three rate-limited attempts', async ({ budget }) => {
  let sends = 0;
  const result = await requestWithBudget(
    budget,
    async () => {
      sends += 1;
      return response(429);
    },
    options,
  );
  expect(result.status()).toBe(429);
  expect(sends).toBe(3);
});

test('setup does not retry an application failure', async ({ budget }) => {
  let sends = 0;
  const result = await requestWithBudget(
    budget,
    async () => {
      sends += 1;
      return response(500);
    },
    options,
  );
  expect(result.status()).toBe(500);
  expect(sends).toBe(1);
});
