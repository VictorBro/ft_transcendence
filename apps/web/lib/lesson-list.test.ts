import { describe, expect, it } from 'vitest';
import { LessonQuerySchema, type LessonCard } from '@ft/shared';

import { groupKey, groupRows, lessonQueryParams, lessonsHref, previousDay } from './lesson-list';

const card = (position: number, overrides: Partial<LessonCard> = {}): LessonCard => ({
  id: `fr-lesson-${position}`,
  level: 'A1',
  position,
  kind: 'grammar',
  topic: 'pronouns',
  theme: null,
  title: `Lesson ${position}`,
  summary: 'A summary.',
  ready: true,
  status: 'todo',
  score: null,
  day: null,
  finishedAt: null,
  ...overrides,
});

const done = (position: number, day: string, overrides: Partial<LessonCard> = {}) =>
  card(position, {
    status: 'done',
    score: 90,
    day,
    finishedAt: `${day}T08:00:00.000Z`,
    ...overrides,
  });

const query = (params: Record<string, string>) => LessonQuerySchema.parse(params);

describe('lessonQueryParams', () => {
  it('leaves every default out', () => {
    expect(lessonQueryParams(query({}))).toEqual({});
    expect(lessonQueryParams(query({ sort: 'foo', page: '0' }))).toEqual({});
  });

  it('keeps what differs, lists comma separated', () => {
    expect(
      lessonQueryParams(
        query({ q: 'être', status: 'failed,soon', topic: 'pronouns', dir: 'desc', page: '2' }),
      ),
    ).toEqual({ q: 'être', status: 'failed,soon', topic: 'pronouns', dir: 'desc', page: '2' });
  });
});

describe('lessonsHref', () => {
  it('is the bare page with no filter, and keeps the others otherwise', () => {
    expect(lessonsHref('fr', query({}))).toBe('/learn/fr/lessons');
    expect(lessonsHref('fr', query({ kind: 'grammar,reading', page: '3' }))).toBe(
      '/learn/fr/lessons?kind=grammar%2Creading&page=3',
    );
  });
});

describe('groupKey', () => {
  it('reads a lesson not ready as soon, by status and by day, whatever its result', () => {
    const stale = done(1, '2026-10-12', { ready: false });
    expect(groupKey(stale, 'status')).toBe('soon');
    expect(groupKey(stale, 'day')).toBe('soon');
    expect(groupKey(stale, 'kind')).toBe('grammar');
  });

  it('groups by day on the finish day, and todo when never finished', () => {
    expect(groupKey(done(1, '2026-10-12'), 'day')).toBe('2026-10-12');
    expect(groupKey(card(2), 'day')).toBe('todo');
  });
});

describe('groupRows', () => {
  it('starts a run wherever the key changes, keeping the order', () => {
    const rows = [done(1, '2026-10-12'), done(2, '2026-10-12'), card(3), card(4, { ready: false })];
    expect(
      groupRows(rows, 'day').map((run) => [run.key, run.cards.map((c) => c.position)]),
    ).toEqual([
      ['2026-10-12', [1, 2]],
      ['todo', [3]],
      ['soon', [4]],
    ]);
  });

  it('gives one run for none, and none for no rows', () => {
    expect(groupRows([card(1), card(2)], 'none')).toHaveLength(1);
    expect(groupRows([], 'status')).toEqual([]);
  });
});

describe('previousDay', () => {
  it('crosses a month and a leap day', () => {
    expect(previousDay('2026-10-12')).toBe('2026-10-11');
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2028-03-01')).toBe('2028-02-29');
  });
});
