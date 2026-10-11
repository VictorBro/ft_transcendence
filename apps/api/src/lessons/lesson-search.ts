import {
  foldText,
  Language,
  LESSON_KINDS,
  LessonCard,
  LessonQuery,
  LESSONS_PAGE_SIZE,
  LessonStatus,
} from '@ft/shared';

export type LessonSearchResult = { items: LessonCard[]; total: number; page: number };

type Compare = (a: LessonCard, b: LessonCard) => number;

export function searchLessons(
  cards: LessonCard[],
  query: LessonQuery,
  lang: Language,
): LessonSearchResult {
  const needles = queryVariants(query.q, lang);
  const matches = cards
    .filter((card) => matchesFilters(card, query) && matchesText(card, needles))
    .sort(compareFor(query));

  const lastPage = Math.max(1, Math.ceil(matches.length / LESSONS_PAGE_SIZE));
  const page = Math.min(query.page, lastPage);
  const start = (page - 1) * LESSONS_PAGE_SIZE;

  return { items: matches.slice(start, start + LESSONS_PAGE_SIZE), total: matches.length, page };
}

/** An empty list is no filter. Each list matches any of its values. */
function matchesFilters(card: LessonCard, query: LessonQuery): boolean {
  const anyOf = <T>(values: T[], value: T) => values.length === 0 || values.includes(value);
  return (
    anyOf(query.status, card.status) &&
    anyOf(query.kind, card.kind) &&
    // A card without a topic (or theme) fails a non-empty topic (or theme) filter.
    (query.topic.length === 0 || (card.topic !== null && query.topic.includes(card.topic))) &&
    (query.theme.length === 0 || (card.theme !== null && query.theme.includes(card.theme)))
  );
}

/**
 * The folded query, plus, in German only, the same with ae, oe and ue spelled
 * as the bare vowel: `maedchen` then finds `Mädchen`, which foldText turns
 * into `madchen`. Not in French, where `coeur` would become `cour`.
 */
export function queryVariants(q: string, lang: Language) {
  const folded = foldText(q);
  if (lang !== 'de') return [folded];

  const bare = folded.replace(/([aou])e/g, '$1');
  return bare === folded ? [folded] : [folded, bare];
}

function matchesText(card: LessonCard, needles: string[]): boolean {
  if (needles[0] === '') return true;

  const haystacks = [foldText(card.title), foldText(card.summary)];
  return needles.some((needle) => haystacks.some((haystack) => haystack.includes(needle)));
}

/*
 * How sorting works here. `.sort(compare)` calls compare(a, b) on pairs of
 * cards and reads the sign of the answer:
 *   negative → a comes first
 *   positive → b comes first
 *   0        → a tie: the next comparison decides
 */

/** The group=status order, as numbers so two statuses subtract: failed, then todo, then done. */
const STATUS_ORDER: Record<LessonStatus, number> = { failed: 0, todo: 1, done: 2 };

/**
 * Compares two values that may be null, and always puts null last.
 *
 * A null score, day or finishedAt means the lesson was never started, and
 * those lessons go to the end whatever `dir` is. So the nulls are settled
 * here, before `compare` runs:
 *   both null → 0  (a tie)
 *   a null    → 1  (a goes after b)
 *   b null    → -1 (b goes after a)
 *   neither   → compare(a, b), which is where `dir` applies
 *
 * Example, sorting scores descending: [90, 55, 40, null], never [null, 90, 55, 40].
 * That second order is what you get by flipping the whole result for desc,
 * which also flips the nulls to the front.
 *
 * <T> lets the same helper compare numbers (score) and strings (day, finishedAt).
 */
function nullsLast<T>(a: T | null, b: T | null, compare: (a: T, b: T) => number): number {
  if (a === null || b === null) {
    return a === b ? 0 : a === null ? 1 : -1;
  }
  return compare(a, b);
}

/**
 * Smallest first, for numbers and strings alike. `a - b` only works on
 * numbers; strings need `<` and `>`. Dates as "2026-10-12" or ISO strings
 * compare correctly as strings, because their format is fixed.
 */
function ascending(a: number | string, b: number | string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * One comparison per `group` value. The order is fixed: `dir` never applies here.
 *   none   → always a tie, so the sort alone decides
 *   status → failed, then todo, then done
 *   day    → newest day first, never started last
 *   kind   → the order of LESSON_KINDS
 */
const GROUPS: Record<LessonQuery['group'], Compare> = {
  none: () => 0,
  status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  // y before x: the newest day first.
  day: (a, b) => nullsLast(a.day, b.day, (x, y) => ascending(y, x)),
  kind: (a, b) => LESSON_KINDS.indexOf(a.kind) - LESSON_KINDS.indexOf(b.kind),
};

/**
 * The comparison `.sort()` uses, in three levels like a phone book (city,
 * then surname, then first name):
 *   1. the group (fixed order)
 *   2. the chosen sort, in the chosen dir
 *   3. the position, ascending, to break any tie left
 * Chained with `||`: 0 is falsy, so a tie falls through to the next level.
 *
 * `sign` is 1 for asc and -1 for desc. It multiplies only the comparison of
 * real values, inside nullsLast, so the nulls stay last in both directions.
 */
function compareFor(query: LessonQuery): Compare {
  const sign = query.dir === 'asc' ? 1 : -1;
  const sorts: Record<LessonQuery['sort'], Compare> = {
    position: (a, b) => sign * (a.position - b.position),
    score: (a, b) => nullsLast(a.score, b.score, (x, y) => sign * (x - y)),
    finishedAt: (a, b) => nullsLast(a.finishedAt, b.finishedAt, (x, y) => sign * ascending(x, y)),
  };
  const group = GROUPS[query.group];
  const sort = sorts[query.sort];
  return (a, b) => group(a, b) || sort(a, b) || a.position - b.position;
}
