import {
  LessonQuerySchema,
  rowStatus,
  type CourseDay,
  type LessonCard,
  type LessonQuery,
} from '@ft/shared';

/** What a query reads as when the URL says nothing: the API's defaults. */
const DEFAULTS = LessonQuerySchema.parse({});

/**
 * A query as URL params, defaults left out, so the links stay short and an
 * empty query is the bare page. Lists go comma separated: apiGet sets each
 * key once, and LessonQuerySchema reads a comma list and a repeated key alike.
 */
export function lessonQueryParams(query: LessonQuery): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    const text = Array.isArray(value) ? value.join(',') : String(value);
    const fallback = DEFAULTS[key as keyof LessonQuery];
    if (text !== (Array.isArray(fallback) ? fallback.join(',') : String(fallback))) {
      params[key] = text;
    }
  }
  return params;
}

/** The all lessons page at this query. */
export function lessonsHref(lang: string, query: LessonQuery): string {
  const search = new URLSearchParams(lessonQueryParams(query)).toString();
  return `/learn/${lang}/lessons${search === '' ? '' : `?${search}`}`;
}

/**
 * The header a row sits under, for each `group`. For day, a lesson not ready
 * is soon and one never finished is todo, the keys of their LessonStatus labels.
 */
export function groupKey(card: LessonCard, group: LessonQuery['group']): string {
  switch (group) {
    case 'none':
      return '';
    case 'status':
      return rowStatus(card);
    case 'kind':
      return card.kind;
    case 'day':
      return card.ready ? (card.day ?? 'todo') : 'soon';
  }
}

/**
 * The rows cut into runs of the same group key, in the order the API sorted
 * them: a header goes before the first row of a page and wherever the key
 * changes. `none` gives one run, shown without a header.
 */
export function groupRows(
  cards: LessonCard[],
  group: LessonQuery['group'],
): { key: string; cards: LessonCard[] }[] {
  const runs: { key: string; cards: LessonCard[] }[] = [];
  for (const card of cards) {
    const key = groupKey(card, group);
    const last = runs.at(-1);
    if (last?.key === key) {
      last.cards.push(card);
    } else {
      runs.push({ key, cards: [card] });
    }
  }
  return runs;
}

/** The calendar day before, in UTC like every course day: 2026-03-01 gives 2026-02-28. */
export function previousDay(day: CourseDay): CourseDay {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
