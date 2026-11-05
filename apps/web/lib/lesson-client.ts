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
const changed = new Set<string>();

const key = (lang: Language, id: string) => `${lang}/${id}`;

export function rememberAttempt(lang: Language, id: string, view: AttemptView, at = Date.now()) {
  seen.set(key(lang, id), { view, at });
  changed.add(key(lang, id));
}

/** True once per change: the lesson page reads itself again. */
export function takeChanged(lang: Language, id: string): boolean {
  return changed.delete(key(lang, id));
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
 * attempt id and unit ref, so a reload keeps it. Storage can be off or
 * full: every access is inside try/catch, and the page works without.
 */
const draftKey = (attemptId: string) => `ft.lesson.drafts.${attemptId}`;

export function loadDrafts(attemptId: string): Record<string, Answer> {
  try {
    const raw = window.localStorage.getItem(draftKey(attemptId));
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

export function saveDrafts(attemptId: string, drafts: Record<string, Answer>) {
  try {
    if (Object.keys(drafts).length === 0) {
      window.localStorage.removeItem(draftKey(attemptId));
    } else {
      window.localStorage.setItem(draftKey(attemptId), JSON.stringify(drafts));
    }
  } catch {
    // Storage off or full: the drafts live in memory only.
  }
}

export function clearDrafts(attemptId: string) {
  saveDrafts(attemptId, {});
}
