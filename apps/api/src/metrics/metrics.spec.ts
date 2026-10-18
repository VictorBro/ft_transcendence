import { LEARNABLE_LANGUAGES, LEVELS, QUESTION_CATEGORIES } from '@ft/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { seriesValue } from '../../test/metrics.fixtures';
import {
  AUTH_SERIES,
  countActiveUsers,
  DRAW_SOURCES,
  EXAM_EVENTS,
  httpRequestDuration,
  placementDraws,
  placementExams,
  placementPoolExhausted,
  questionRestockFailures,
  questionRestockInserted,
  questionRestocks,
  RESTOCK_FAILURE_REASONS,
  RESTOCK_STATUSES,
  touchActiveUser,
} from './metrics';

const MINUTE = 60_000;

describe('metrics', () => {
  // increase() misses a counter's first increment when the series is born at 1.
  describe('the series an alert or a panel reads', () => {
    it('exist at 0 from the start for every language and level that can run dry', async () => {
      const { values } = await placementPoolExhausted.get();

      expect(values).toHaveLength(LEARNABLE_LANGUAGES.length * LEVELS.length);
      expect(values.every(({ value }) => value === 0)).toBe(true);
      expect(await seriesValue(placementPoolExhausted, { lang: 'de', level: 'C2' })).toBe(0);
    });

    it('exist at 0 from the start for every category and restock failure reason', async () => {
      const { values } = await questionRestockFailures.get();

      expect(values).toHaveLength(QUESTION_CATEGORIES.length * RESTOCK_FAILURE_REASONS.length);
      expect(values.every(({ value }) => value === 0)).toBe(true);
      expect(
        await seriesValue(questionRestockFailures, { category: 'reading', reason: 'llm' }),
      ).toBe(0);
    });

    // Otherwise the first exam after a restart never shows on the Learning dashboard.
    it('exist at 0 from the start for every exam event, draw source and restock status', async () => {
      const cells = LEARNABLE_LANGUAGES.length * LEVELS.length * QUESTION_CATEGORIES.length;
      const expected = [
        [placementExams, LEARNABLE_LANGUAGES.length * EXAM_EVENTS.length],
        [placementDraws, cells * DRAW_SOURCES.length],
        [questionRestocks, cells * RESTOCK_STATUSES.length],
        [questionRestockInserted, cells],
      ] as const;

      for (const [metric, series] of expected) {
        const { values } = await metric.get();
        expect(values).toHaveLength(series);
        expect(values.every(({ value }) => value === 0)).toBe(true);
      }
      expect(await seriesValue(placementExams, { lang: 'fr', event: 'completed' })).toBe(0);
    });

    // Otherwise the first sign-up after a restart never reaches "Sign-ups, 24 h".
    it('exist at 0 from the start for the sign-up and sign-in results the auth panels read', async () => {
      const series = AUTH_SERIES.flatMap(([route, statuses]) =>
        statuses.map((status_code) => ({ method: 'POST', route, status_code })),
      );

      expect(series).toHaveLength(6);
      for (const labels of series) {
        expect(await seriesValue(httpRequestDuration, labels, '_count')).toBe(0);
      }
      const { values } = await httpRequestDuration.get();
      expect(values.every(({ value }) => value === 0)).toBe(true);
    });
  });

  describe('active users', () => {
    const t = 1_000_000_000_000;

    beforeEach(() => {
      // Infinitely late: every user seen so far is past the window.
      countActiveUsers(Infinity);
    });

    it('counts a user seen in the last 5 minutes', () => {
      touchActiveUser('u1', t);

      expect(countActiveUsers(t + 5 * MINUTE - 1)).toBe(1);
      expect(countActiveUsers(t + 5 * MINUTE)).toBe(0);
    });

    it('counts a user once however often seen, from the last time', () => {
      touchActiveUser('u1', t);
      touchActiveUser('u2', t + MINUTE);
      touchActiveUser('u1', t + 4 * MINUTE);

      expect(countActiveUsers(t + 4 * MINUTE)).toBe(2);
      expect(countActiveUsers(t + 6 * MINUTE)).toBe(1);
      expect(countActiveUsers(t + 9 * MINUTE)).toBe(0);
    });
  });
});
