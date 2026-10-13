import {
  foldText,
  Language,
  LESSON_KINDS,
  LessonCard,
  LessonQuery,
  LESSONS_PAGE_SIZE,
  LessonStatus,
} from '@ft/shared';

/**
 * What the search sends back:
 *   items → the lessons on the page asked for
 *   total → how many lessons matched, on all pages together
 *   page  → the page number really shown (see searchLessons)
 */
export type LessonSearchResult = { items: LessonCard[]; total: number; page: number };

/** A function that tells which of two lessons comes first. See "How sorting works" below. */
type Compare = (a: LessonCard, b: LessonCard) => number;

/**
 * The search on the all lessons page. It works in 3 steps:
 *
 *   1. Keep: throw away every lesson that does not match the filters
 *      (status, kind, topic, theme) or the text the user typed.
 *   2. Sort: put the lessons that are left in the order the user chose.
 *   3. Cut: give back only one page of LESSONS_PAGE_SIZE lessons.
 *
 * Example with 45 matching lessons and 20 lessons a page:
 *   page 1 → lessons 1 to 20
 *   page 2 → lessons 21 to 40
 *   page 3 → lessons 41 to 45
 *
 * If the user asks for a page that does not exist (page 99), they get the
 * last page instead of an empty one. With no match at all, the last page
 * is page 1, so they get page 1 with an empty list.
 */
export function searchLessons(
  cards: LessonCard[],
  query: LessonQuery,
  lang: Language,
): LessonSearchResult {
  // Step 1 and 2: keep, then sort.
  // "Coeur  testeur" → ["coeur", "testeur"]. Split on any run of spaces, and
  // the filter drops the empty word a leading space would leave.
  const words = foldText(query.q)
    .split(/\s+/)
    .filter((word) => word !== '');
  const matches = cards
    .filter((card) => matchesFilters(card, query) && matchesText(card, words, lang))
    .sort(compareFor(query));

  // Step 3: cut. 45 lessons / 20 = 2.25, rounded up to 3 pages.
  // Math.max(1, ...) because 0 lessons still make 1 (empty) page.
  const lastPage = Math.max(1, Math.ceil(matches.length / LESSONS_PAGE_SIZE));
  const page = Math.min(query.page, lastPage);
  // Pages start at 1, but lists start at 0: page 1 starts at 0, page 2 at 20.
  const start = (page - 1) * LESSONS_PAGE_SIZE;

  return { items: matches.slice(start, start + LESSONS_PAGE_SIZE), total: matches.length, page };
}

/**
 * Does this lesson pass all the filters? It must pass every one of them.
 *
 * Each filter is a list the user picked, and it follows 2 rules:
 *   - An empty list means "no filter": every lesson passes.
 *     Nothing picked in status → all statuses are fine.
 *   - Otherwise the lesson passes if it has ANY of the values in the list.
 *     status = [done, failed] → a done lesson passes, a failed one too,
 *     a todo one does not.
 */
function matchesFilters(card: LessonCard, query: LessonQuery): boolean {
  // The 2 rules above, written once. <T> lets it work for statuses and kinds alike.
  const anyOf = <T>(values: T[], value: T) => values.length === 0 || values.includes(value);
  return (
    anyOf(query.status, card.status) &&
    anyOf(query.kind, card.kind) &&
    // Topic and theme follow the same 2 rules, but a lesson can have none:
    // grammar lessons have a topic and no theme, the others a theme and no
    // topic. A lesson without a topic never passes a topic filter, and the
    // same for themes. That is why they cannot just use anyOf.
    (query.topic.length === 0 || (card.topic !== null && query.topic.includes(card.topic))) &&
    (query.theme.length === 0 || (card.theme !== null && query.theme.includes(card.theme)))
  );
}

/**
 * German only: people often type "ae", "oe", "ue" when they have no
 * ä, ö, ü on their keyboard. But foldText turns "Mädchen" into "madchen",
 * so "maedchen" would never find it. bareVowels removes the e:
 *   "maedchen" → "madchen"
 *
 * matchesText tries it two ways, on each typed word:
 * - On the word only: "sturmboeen" → "sturmboen", found in "Sturmböen"
 *   (folded "sturmboen"). Done on both sides, the lesson would become
 *   "sturmbon", which does not contain "sturmboen".
 * - On both sides: German has real "ue" too, and one word can hold a real
 *   one and a typed one. "steuererklaerung" → "steurerklarung" is not in
 *   "steuererklarung", but on both sides both become "steurerklarung".
 *
 * Not in French: there "coeur" would become "cour", another word.
 */
export function bareVowels(text: string): string {
  return text.replace(/([aou])e/g, '$1');
}

/**
 * Does the lesson contain what the user typed?
 *
 * Like looking for needles in a haystack: the needles are the words the user
 * typed, the haystacks are the lesson's title and summary. foldText makes
 * both lowercase and removes the accents, so "elephant" finds "Éléphant".
 * A part of a word is enough: "boiss" finds "boisson".
 *
 * Every word must be found, in any order, each in the title or the summary:
 * "coeur testeur" finds "Le cœur du testeur", and "cour" never finds it.
 *
 * In German, bareVowels is tried too. The plain match is still tried first:
 * bareVowels on a part of a word can lose it. "erfeuer" is in "dauerfeuer",
 * but bareVowels gives "erfeur", in neither "dauerfeuer" nor "daurfeur".
 */
function matchesText(card: LessonCard, words: string[], lang: Language): boolean {
  // The user typed nothing: every lesson matches.
  if (words.length === 0) return true;

  const haystacks = [foldText(card.title), foldText(card.summary)];
  return words.every((word) => {
    const bareWord = bareVowels(word);
    return haystacks.some(
      (haystack) =>
        haystack.includes(word) ||
        (lang === 'de' && (haystack.includes(bareWord) || bareVowels(haystack).includes(bareWord))),
    );
  });
}

/*
 * How sorting works. `.sort(compare)` takes two lessons, a and b, gives
 * them to compare(a, b), and looks at the answer:
 *   below 0 → a goes first
 *   above 0 → b goes first
 *   0       → a tie: they are equal for this rule, the next rule decides
 *
 * Trick for numbers: a - b gives the smallest first.
 *   a = 3, b = 5 → 3 - 5 = -2, below 0, so 3 goes first.
 * And b - a, or -1 * (a - b), gives the biggest first.
 */

/** The order of the statuses when grouping: failed first, then todo, then done. */
const STATUS_ORDER: Record<LessonStatus, number> = { failed: 0, todo: 1, done: 2 };

/**
 * Compares two values that can be null, and always puts null at the end.
 *
 * null means the lesson was never started: no score, no day, no finish
 * date. Those lessons always go last, in the small to big order and in
 * the big to small order too. So we deal with null first:
 *   both null → 0  (a tie)
 *   a is null → 1  (a goes after b)
 *   b is null → -1 (b goes after a)
 *   no null   → compare(a, b) decides
 *
 * Example, scores from big to small: [90, 55, 40, null].
 * If we flipped the whole answer instead, null would jump to the front:
 * [null, 90, 55, 40]. That is why the flip happens only inside compare.
 *
 * <T> lets it work for numbers (score) and for text (day, finishedAt).
 */
function nullsLast<T>(a: T | null, b: T | null, compare: (a: T, b: T) => number): number {
  if (a === null || b === null) {
    return a === b ? 0 : a === null ? 1 : -1;
  }
  return compare(a, b);
}

/**
 * Smallest first, for numbers and for text. a - b only works for numbers,
 * text needs < and >. Dates like "2026-10-12" sort correctly as text,
 * because the year comes first, then the month, then the day, always with
 * the same number of digits.
 */
function ascending(a: number | string, b: number | string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * How to put lessons into groups, one rule per choice of `group`.
 * The order of the groups never changes, even when the user picks
 * big to small (`dir`).
 *   none   → no groups: always a tie, so only the sort decides
 *   status → failed, then todo, then done
 *   day    → the newest day first, never started last
 *   kind   → the order of LESSON_KINDS
 */
const GROUPS: Record<LessonQuery['group'], Compare> = {
  none: () => 0,
  status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  // y before x, to flip it: the newest day first.
  day: (a, b) => nullsLast(a.day, b.day, (x, y) => ascending(y, x)),
  kind: (a, b) => LESSON_KINDS.indexOf(a.kind) - LESSON_KINDS.indexOf(b.kind),
};

/**
 * Builds the compare function that `.sort()` uses. It has 3 rules, tried
 * one after the other, like a phone book sorts by city, then by last
 * name, then by first name:
 *   1. the group (its order never changes)
 *   2. the sort the user chose, small to big or big to small
 *   3. the position, small to big, if the lessons are still tied
 *
 * The rules are joined with ||. A tie gives 0, and 0 counts as false,
 * so || moves on to the next rule. Any other answer stops there.
 *
 * `sign` is 1 for small to big (asc) and -1 for big to small (desc).
 * Multiplying by -1 flips the order. It goes inside nullsLast, so lessons
 * never started stay last both ways.
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
