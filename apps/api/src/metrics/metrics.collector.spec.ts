import { Logger } from '@nestjs/common';
import type { Metric } from '@prometheus-io/client';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { seriesValue } from '../../test/metrics.fixtures';
import type { PrismaService } from '../prisma/prisma.service';
import { countActiveUsers, registry, touchActiveUser } from './metrics';
import { MetricsCollector } from './metrics.collector';

type Where = { sourceId: null | { not: null } };
const cell = (lang: string, level: string, category: string, count: number) => ({
  lang,
  level,
  category,
  _count: { _all: count },
});

const gauge = (name: string) => registry.getSingleMetric(name) as Metric<string>;
const bank = (labels: Record<string, string>) =>
  seriesValue(gauge('ft_question_bank_questions'), labels);

describe('MetricsCollector', () => {
  let prisma: {
    questionBank: { groupBy: MockInstance };
    user: { count: MockInstance };
  };
  let collector: MetricsCollector;
  let warn: MockInstance;

  beforeEach(() => {
    vi.useFakeTimers();
    registry.resetMetrics();
    // Infinitely late: every user seen so far is past the window.
    countActiveUsers(Infinity);
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    prisma = {
      questionBank: {
        groupBy: vi.fn(async ({ where }: { where: Where }) =>
          where.sourceId === null
            ? [cell('de', 'B1', 'grammar', 2)]
            : [cell('de', 'B1', 'grammar', 5), cell('fr', 'A1', 'reading', 1)],
        ),
      },
      user: { count: vi.fn(async () => 3) },
    };
    collector = new MetricsCollector(prisma as unknown as PrismaService);
    collector.onModuleInit();
  });

  afterEach(() => {
    collector.onModuleDestroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('counts the bank by cell and source, written rows apart from generated ones', async () => {
    await registry.metrics();

    expect(prisma.questionBank.groupBy.mock.calls).toEqual([
      [
        {
          by: ['lang', 'level', 'category'],
          where: { sourceId: { not: null } },
          _count: { _all: true },
        },
      ],
      [{ by: ['lang', 'level', 'category'], where: { sourceId: null }, _count: { _all: true } }],
    ]);
    const grammar = { lang: 'de', level: 'B1', category: 'grammar' };
    expect(await bank({ ...grammar, source: 'written' })).toBe(5);
    expect(await bank({ ...grammar, source: 'generated' })).toBe(2);
    expect(await bank({ lang: 'fr', level: 'A1', category: 'reading', source: 'written' })).toBe(1);
  });

  // The thinnest cell is the one to worry about, so it must not be missing.
  it('shows every cell of the bank, an empty one at 0', async () => {
    const { values } = await gauge('ft_question_bank_questions').get();

    expect(values).toHaveLength(3 * 6 * 3 * 2);
    expect(await bank({ lang: 'en', level: 'C2', category: 'reading', source: 'generated' })).toBe(
      0,
    );
  });

  it('counts the accounts, and the users signed in over the last 5 minutes', async () => {
    touchActiveUser('u1');
    touchActiveUser('u2');

    expect(await seriesValue(gauge('ft_users'))).toBe(3);
    expect(await seriesValue(gauge('ft_active_users'))).toBe(2);
  });

  // A 30 s scrape must not cost two queries a minute.
  it('queries the database at most once a minute', async () => {
    await registry.metrics();
    prisma.user.count.mockResolvedValue(4);
    vi.advanceTimersByTime(59_999);
    await registry.metrics();

    expect(prisma.questionBank.groupBy).toHaveBeenCalledTimes(2);
    expect(await seriesValue(gauge('ft_users'))).toBe(3);

    vi.advanceTimersByTime(1);
    expect(await seriesValue(gauge('ft_users'))).toBe(4);
    await registry.metrics();
    expect(prisma.questionBank.groupBy).toHaveBeenCalledTimes(4);
  });

  it('puts a cell emptied since the last query back to 0', async () => {
    await registry.metrics();
    prisma.questionBank.groupBy.mockResolvedValue([]);
    vi.advanceTimersByTime(60_000);

    expect(await bank({ lang: 'de', level: 'B1', category: 'grammar', source: 'written' })).toBe(0);
  });

  // Otherwise Prometheus would report "Postgres hiccupped" as "the API is down".
  it('keeps the last values and a working scrape when the database fails, and asks again next time', async () => {
    await registry.metrics();
    vi.advanceTimersByTime(60_000);
    prisma.questionBank.groupBy.mockRejectedValueOnce(new Error('connection lost'));
    prisma.user.count.mockRejectedValueOnce(new Error('connection lost'));

    const scrape = await registry.metrics();

    expect(scrape).toContain('ft_users 3');
    expect(scrape).toContain(
      'ft_question_bank_questions{lang="de",level="B1",category="grammar",source="written"} 5',
    );
    expect(warn).toHaveBeenCalledWith(
      'ft_question_bank_questions not collected: Error: connection lost',
    );
    expect(warn).toHaveBeenCalledWith('ft_users not collected: Error: connection lost');

    prisma.user.count.mockResolvedValue(4);
    expect(await seriesValue(gauge('ft_users'))).toBe(4);
  });

  // Prometheus drops a scrape after 10 s, which would fire ApiDown.
  it('answers within 3 s when the database hangs, and keeps one query in flight at most', async () => {
    await registry.metrics();
    vi.advanceTimersByTime(60_000);
    prisma.questionBank.groupBy.mockReturnValue(new Promise(() => undefined));

    const scrape = registry.metrics();
    await vi.advanceTimersByTimeAsync(3_000);

    expect(await scrape).toContain(
      'ft_question_bank_questions{lang="de",level="B1",category="grammar",source="written"} 5',
    );
    expect(warn).toHaveBeenCalledWith(
      'ft_question_bank_questions not collected: Error: no answer in 3000 ms',
    );
    expect(prisma.questionBank.groupBy).toHaveBeenCalledTimes(4);

    await registry.metrics();
    expect(prisma.questionBank.groupBy).toHaveBeenCalledTimes(4);
  });

  // An e2e file that builds two apps would otherwise hit "already registered".
  it('unregisters its gauges when the module is destroyed', () => {
    collector.onModuleDestroy();

    for (const name of ['ft_question_bank_questions', 'ft_users', 'ft_active_users']) {
      expect(registry.getSingleMetric(name)).toBeUndefined();
    }
    collector.onModuleInit();
  });
});
