import { lessons, type Language, type Locale } from '@ft/shared';

import { clientGet, clientPost, type ApiResult } from './api-client';

type AttemptView = lessons.player.AttemptView;
type AttemptRead = lessons.player.AttemptRead;
type PageResult = lessons.player.PageResult;
type Answer = lessons.player.Answer;

const P = lessons.player;

/** The attempt routes of #145, from the browser. */
function attemptPath(lang: Language, id: string) {
  return `/api/courses/${lang}/lessons/${id}/attempt`;
}

/** Starts the lesson, resumes it, or retakes it after the results. */
export function startAttempt(
  lang: Language,
  id: string,
  locale: Locale,
): Promise<ApiResult<AttemptView>> {
  return clientPost(P.AttemptViewSchema, attemptPath(lang, id), { locale });
}

export function readAttempt(lang: Language, id: string): Promise<ApiResult<AttemptRead>> {
  return clientGet(P.AttemptReadSchema, attemptPath(lang, id));
}

/** Posts the page at the cursor: its feedback (practice only), then the attempt. */
export function submitPage(
  lang: Language,
  id: string,
  index: number,
  attemptId: string,
  answers: Record<string, Answer>,
): Promise<ApiResult<PageResult>> {
  return clientPost(P.PageResultSchema, `${attemptPath(lang, id)}/pages/${index}`, {
    attemptId,
    answers,
  });
}

/* ------------------------------------------------------------ the tab */

/*
 * Back and Forward show a page from the router's cache, as it was first
 * rendered. The player writes down here, in the tab's memory, the last
 * attempt it saw of each lesson, so the lesson page knows to read itself
 * again and the player resumes from where it really is. A reload starts
 * from the server anyway.
 */
interface Seen {
  view: AttemptView;
  /** Date.now() when it arrived: an exam page's time left counts from here. */
  at: number;
}
const seen = new Map<string, Seen>();

const key = (lang: Language, id: string) => `${lang}/${id}`;

export function rememberAttempt(lang: Language, id: string, view: AttemptView, at = Date.now()) {
  seen.set(key(lang, id), { view, at });
}

/** Where a page found the attempt when the server rendered it: its id and page, null once finished. */
export interface Cursor {
  attemptId: string;
  index: number | null;
}

export const cursorOf = (attempt: AttemptView | null): Cursor | null =>
  attempt === null ? null : { attemptId: attempt.attemptId, index: attempt.current?.index ?? null };

/**
 * Whether a lesson page shows an attempt older than the one this tab saw
 * last: Back and Forward bring a page from the router's cache, as first
 * rendered. A page the server rendered after the player moved shows the
 * same cursor or a further one, and needs no second read.
 */
export function isStale(lang: Language, id: string, rendered: Cursor | null): boolean {
  const last = seen.get(key(lang, id));
  if (!last) return false;
  const mine = cursorOf(last.view)!;
  if (rendered === null || rendered.attemptId !== mine.attemptId) return true;
  const position = (index: number | null) => index ?? Infinity;
  return position(rendered.index) < position(mine.index);
}

/**
 * The newer of the attempt the page was rendered with and the one this
 * tab saw last. Attempts only move forward, so within one attempt the
 * further cursor is the newer; another attempt id is a retake, and the
 * rendered one wins.
 */
export function newerAttempt(
  lang: Language,
  id: string,
  rendered: AttemptView,
  renderedAt: number,
): Seen {
  const last = seen.get(key(lang, id));
  if (!last || last.view.attemptId !== rendered.attemptId) {
    return { view: rendered, at: renderedAt };
  }
  const position = (v: AttemptView) => (v.current === null ? Infinity : v.current.index);
  return position(last.view) >= position(rendered) ? last : { view: rendered, at: renderedAt };
}

/* ------------------------------------------------------------- drafts */

/*
 * What the learner typed or picked on the page at the cursor, kept by
 * lesson, attempt id and unit ref, so a reload keeps it. Only the current
 * attempt of a lesson keeps its key: loading one sweeps the others (left
 * behind, retaken, or finished elsewhere). Storage can be off or full:
 * every access is inside try/catch, and the page works without.
 */
const DRAFTS = 'ft.lesson.drafts.';
const lessonPrefix = (lang: Language, id: string) => `${DRAFTS}${lang}.${id}.`;

/** Where the drafts of one attempt of a lesson live. */
export interface DraftSlot {
  lang: Language;
  id: string;
  attemptId: string;
}
const draftKey = ({ lang, id, attemptId }: DraftSlot) => `${lessonPrefix(lang, id)}${attemptId}`;

export function loadDrafts(slot: DraftSlot): Record<string, Answer> {
  try {
    const storage = window.localStorage;
    const own = draftKey(slot);
    const prefix = lessonPrefix(slot.lang, slot.id);
    const stale: string[] = [];
    for (let n = 0; n < storage.length; n += 1) {
      const key = storage.key(n);
      if (key !== null && key.startsWith(prefix) && key !== own) stale.push(key);
    }
    for (const key of stale) storage.removeItem(key);

    const raw = storage.getItem(own);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, Answer> = {};
    for (const [ref, value] of Object.entries(parsed)) {
      const answer = P.AnswerSchema.safeParse(value);
      if (P.RefSchema.safeParse(ref).success && answer.success) out[ref] = answer.data;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveDrafts(slot: DraftSlot, drafts: Record<string, Answer>) {
  try {
    if (Object.keys(drafts).length === 0) {
      window.localStorage.removeItem(draftKey(slot));
    } else {
      window.localStorage.setItem(draftKey(slot), JSON.stringify(drafts));
    }
  } catch {
    // Storage off or full: the drafts live in memory only.
  }
}

export function clearDrafts(slot: DraftSlot) {
  saveDrafts(slot, {});
}
