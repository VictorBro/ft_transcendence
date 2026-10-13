import {
  type Language,
  type LessonCard,
  type LessonQuery,
  LESSON_PASS_MARK,
  LESSONS_PAGE_SIZE,
} from '@ft/shared';
import { describe, expect, it } from 'vitest';

import { bareVowels, searchLessons } from './lesson-search';

/** A todo grammar card; a score also sets day, finishedAt and the status that follows it. */
const card = (position: number, overrides: Partial<LessonCard> = {}): LessonCard => ({
  id: `fr-lesson-${position}`,
  level: 'A1',
  position,
  kind: 'grammar',
  topic: 'nouns_and_determiners',
  theme: null,
  title: `Lesson ${position}`,
  summary: 'A summary.',
  status: 'todo',
  score: null,
  day: null,
  finishedAt: null,
  ...overrides,
});

const scored = (
  position: number,
  score: number,
  day: string,
  overrides: Partial<LessonCard> = {},
): LessonCard =>
  card(position, {
    score,
    day,
    finishedAt: `${day}T08:00:00.000Z`,
    status: score >= LESSON_PASS_MARK ? 'done' : 'failed',
    ...overrides,
  });

const theme = (position: number, overrides: Partial<LessonCard> = {}): LessonCard =>
  card(position, { kind: 'vocabulary', topic: null, theme: 'daily_life', ...overrides });

const query = (overrides: Partial<LessonQuery> = {}): LessonQuery => ({
  q: '',
  status: [],
  kind: [],
  topic: [],
  theme: [],
  sort: 'position',
  dir: 'asc',
  group: 'none',
  page: 1,
  ...overrides,
});

const positions = (cards: LessonCard[], q: Partial<LessonQuery> = {}, lang: Language = 'fr') =>
  searchLessons(cards, query(q), lang).items.map((c) => c.position);

describe('bareVowels', () => {
  it('drops the e after a, o and u', () => {
    expect(bareVowels('maedchen')).toBe('madchen');
    expect(bareVowels('schoen gruen')).toBe('schon grun');
  });

  it('changes nothing without ae, oe or ue', () => {
    expect(bareVowels('hund')).toBe('hund');
    expect(bareVowels('')).toBe('');
  });
});

describe('searchLessons, text', () => {
  const cards = [
    card(1, { title: 'Le, la, les', summary: 'Les articles définis.' }),
    card(2, { title: 'Au café', summary: 'Commander une boisson.' }),
    card(3, { title: 'Das Mädchen', summary: 'Ein Nomen.' }),
    card(4, { title: 'Neue Wörter', summary: 'Die Steuererklärung.' }),
    card(5, { title: 'Le cœur', summary: 'Un organe.' }),
    card(6, { title: 'La cour', summary: 'Un lieu.' }),
  ];

  it('keeps every card for an empty query', () => {
    expect(positions(cards)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('matches the title or the summary, ignoring case and accents', () => {
    expect(positions(cards, { q: 'CAFE' })).toEqual([2]);
    expect(positions(cards, { q: 'definis' })).toEqual([1]);
  });

  it('matches part of a word', () => {
    expect(positions(cards, { q: 'boiss' })).toEqual([2]);
  });

  it('finds Mädchen from maedchen in German only', () => {
    expect(positions(cards, { q: 'maedchen' }, 'de')).toEqual([3]);
    expect(positions(cards, { q: 'maedchen' })).toEqual([]);
  });

  it('finds a German word with a real ue next to a typed ae or oe', () => {
    expect(positions(cards, { q: 'neue woerter' }, 'de')).toEqual([4]);
    expect(positions(cards, { q: 'steuererklaerung' }, 'de')).toEqual([4]);
  });

  it('finds a typed oe next to an e the lesson already has', () => {
    const storm = [card(1, { title: 'Sturmböen', summary: 'Das Wetter.' })];
    expect(positions(storm, { q: 'sturmboeen' }, 'de')).toEqual([1]);
  });

  it('still finds part of a word on ae, oe or ue in German', () => {
    expect(positions(cards, { q: 'neue' }, 'de')).toEqual([4]);
    expect(positions(cards, { q: 'e' }, 'de')).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('keeps oe in French, so coeur finds cœur and never cour', () => {
    expect(positions(cards, { q: 'coeur' })).toEqual([5]);
  });

  it('needs every word, in any order', () => {
    expect(positions(cards, { q: 'cœur le' })).toEqual([5]);
    expect(positions(cards, { q: 'coeur cour' })).toEqual([]);
  });

  it('finds one word in the title and another in the summary', () => {
    expect(positions(cards, { q: 'café boisson' })).toEqual([2]);
    expect(positions(cards, { q: 'woerter steuererklaerung' }, 'de')).toEqual([4]);
  });

  it('finds nothing when nothing matches', () => {
    const result = searchLessons(cards, query({ q: 'xyz' }), 'fr');
    expect(result).toEqual({ items: [], total: 0, page: 1 });
  });
});

describe('searchLessons, filters', () => {
  const cards = [
    card(1),
    scored(2, 90, '2026-10-10'),
    scored(3, 40, '2026-10-11'),
    card(4, { topic: 'pronouns' }),
    theme(5),
    theme(6, { kind: 'reading', theme: 'travel' }),
  ];

  it('keeps any of the listed statuses', () => {
    expect(positions(cards, { status: ['done'] })).toEqual([2]);
    expect(positions(cards, { status: ['done', 'failed'] })).toEqual([2, 3]);
  });

  it('keeps any of the listed kinds', () => {
    expect(positions(cards, { kind: ['vocabulary', 'reading'] })).toEqual([5, 6]);
  });

  it('keeps any of the listed topics, and drops cards without one', () => {
    expect(positions(cards, { topic: ['pronouns'] })).toEqual([4]);
    expect(positions(cards, { topic: ['nouns_and_determiners'] })).toEqual([1, 2, 3]);
  });

  it('keeps any of the listed themes, and drops cards without one', () => {
    expect(positions(cards, { theme: ['travel'] })).toEqual([6]);
  });

  it('needs every filter to match', () => {
    expect(positions(cards, { status: ['todo'], topic: ['nouns_and_determiners'] })).toEqual([1]);
    expect(positions(cards, { kind: ['reading'], theme: ['daily_life'] })).toEqual([]);
  });

  it('combines filters with the text', () => {
    const named = [card(1, { title: 'Café' }), scored(2, 90, '2026-10-10', { title: 'Café' })];
    expect(positions(named, { q: 'cafe', status: ['done'] })).toEqual([2]);
  });
});

describe('searchLessons, sort', () => {
  const cards = [
    scored(3, 40, '2026-10-11'),
    card(1),
    scored(4, 90, '2026-10-12'),
    scored(2, 70, '2026-10-10'),
    card(5),
  ];

  it('sorts by position by default', () => {
    expect(positions(cards)).toEqual([1, 2, 3, 4, 5]);
  });

  it('sorts by position descending', () => {
    expect(positions(cards, { dir: 'desc' })).toEqual([5, 4, 3, 2, 1]);
  });

  it('sorts by score, never started last in both directions', () => {
    expect(positions(cards, { sort: 'score' })).toEqual([3, 2, 4, 1, 5]);
    expect(positions(cards, { sort: 'score', dir: 'desc' })).toEqual([4, 2, 3, 1, 5]);
  });

  it('sorts by finishedAt, never started last in both directions', () => {
    expect(positions(cards, { sort: 'finishedAt' })).toEqual([2, 3, 4, 1, 5]);
    expect(positions(cards, { sort: 'finishedAt', dir: 'desc' })).toEqual([4, 3, 2, 1, 5]);
  });

  it('breaks ties by position ascending, whatever the dir', () => {
    const tied = [
      scored(3, 70, '2026-10-10'),
      scored(1, 70, '2026-10-11'),
      scored(2, 70, '2026-10-12'),
    ];
    expect(positions(tied, { sort: 'score', dir: 'desc' })).toEqual([1, 2, 3]);
  });

  it('does not change the input order', () => {
    const copy = [...cards];
    positions(cards, { sort: 'score' });
    expect(cards).toEqual(copy);
  });
});

describe('searchLessons, group', () => {
  it('groups by status: failed, then todo, then done', () => {
    const cards = [scored(1, 90, '2026-10-10'), card(2), scored(3, 40, '2026-10-11'), card(4)];
    expect(positions(cards, { group: 'status' })).toEqual([3, 2, 4, 1]);
  });

  it('groups by day, newest first and never started last', () => {
    const cards = [card(1), scored(2, 90, '2026-10-10'), scored(3, 40, '2026-10-12')];
    expect(positions(cards, { group: 'day' })).toEqual([3, 2, 1]);
  });

  it('groups by kind in the order of LESSON_KINDS', () => {
    const cards = [
      theme(1, { kind: 'reading' }),
      theme(2, { kind: 'functions' }),
      theme(3),
      card(4),
    ];
    expect(positions(cards, { group: 'kind' })).toEqual([4, 3, 2, 1]);
  });

  it('keeps the group order fixed and applies dir inside each group', () => {
    const cards = [scored(1, 90, '2026-10-10'), card(2), scored(3, 95, '2026-10-11'), card(4)];
    expect(positions(cards, { group: 'status', dir: 'desc' })).toEqual([4, 2, 3, 1]);
    expect(positions(cards, { group: 'status', sort: 'score', dir: 'desc' })).toEqual([2, 4, 3, 1]);
  });
});

describe('searchLessons, pages', () => {
  const many = Array.from({ length: LESSONS_PAGE_SIZE * 2 + 5 }, (_, i) => card(i + 1));

  it('returns one page of LESSONS_PAGE_SIZE and the total', () => {
    const result = searchLessons(many, query(), 'fr');
    expect(result.items).toHaveLength(LESSONS_PAGE_SIZE);
    expect(result.items[0].position).toBe(1);
    expect(result.total).toBe(many.length);
    expect(result.page).toBe(1);
  });

  it('returns the rest on the last page', () => {
    const result = searchLessons(many, query({ page: 3 }), 'fr');
    expect(result.items.map((c) => c.position)).toEqual([41, 42, 43, 44, 45]);
    expect(result.page).toBe(3);
  });

  it('clamps a page past the end to the last page', () => {
    const result = searchLessons(many, query({ page: 99 }), 'fr');
    expect(result.page).toBe(3);
    expect(result.items).toHaveLength(5);
  });

  it('counts the total after the filters, not before', () => {
    const result = searchLessons(many, query({ q: '4' }), 'fr');
    // Lesson 4, 14, 24, 34, and 40 to 45.
    expect(result.total).toBe(10);
  });

  it('is page 1 with no matches', () => {
    expect(searchLessons([], query({ page: 4 }), 'fr')).toEqual({ items: [], total: 0, page: 1 });
  });
});
