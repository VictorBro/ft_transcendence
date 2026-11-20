/**
 * The logic of the reading lesson's renderers (#148) that needs no
 * browser: where the key words sit in a paragraph, and the skim
 * countdown. The components in components/lesson/kinds/reading.tsx only
 * draw what these return.
 */

/** A piece of a paragraph: plain text, or a key word to mark. */
export interface Segment {
  text: string;
  mark: boolean;
}

/** A letter or a digit in any script: a key word never starts or ends inside a word. */
const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Cuts a paragraph into plain and marked pieces. Every occurrence of a
 * highlight is marked (a key word can come back: "avant" twice), the
 * longest first where two overlap ("on se voit" over "on"), and only as a
 * whole word ("avant" is not marked inside "auparavant").
 */
export function markKeywords(paragraph: string, highlights: readonly string[]): Segment[] {
  const marks = [...new Set(highlights.filter((h) => h.trim() !== ''))].sort(
    (a, b) => b.length - a.length,
  );
  const taken: [number, number][] = [];
  for (const mark of marks) {
    for (let at = paragraph.indexOf(mark); at >= 0; at = paragraph.indexOf(mark, at + 1)) {
      const end = at + mark.length;
      const before = paragraph[at - 1];
      const after = paragraph[end];
      const whole =
        (before === undefined || !WORD_CHAR.test(before) || !WORD_CHAR.test(mark[0]!)) &&
        (after === undefined || !WORD_CHAR.test(after) || !WORD_CHAR.test(mark[mark.length - 1]!));
      if (!whole || taken.some(([s, e]) => at < e && end > s)) continue;
      taken.push([at, end]);
    }
  }
  taken.sort((a, b) => a[0] - b[0]);

  const out: Segment[] = [];
  let cursor = 0;
  for (const [start, end] of taken) {
    if (start > cursor) out.push({ text: paragraph.slice(cursor, start), mark: false });
    out.push({ text: paragraph.slice(start, end), mark: true });
    cursor = end;
  }
  if (cursor < paragraph.length) out.push({ text: paragraph.slice(cursor), mark: false });
  return out;
}

/**
 * The skim page: the document is open until its deadline or until the
 * learner has finished reading; then it is put away and the question
 * opens. The countdown is this browser's: the server stores no deadline.
 * It is kept with the attempt's drafts, so a reload neither gives the
 * time back nor shows the document again.
 */
export type SkimState = { phase: 'reading'; deadline: number } | { phase: 'question' };

/** The value kept for a reload. */
export function skimValue(state: SkimState): string {
  return state.phase === 'question' ? 'question' : `reading:${state.deadline}`;
}

/**
 * The state of a skim page from what was kept, or a new countdown of
 * `seconds` from `now`. A deadline already past opens the question.
 */
export function readSkim(kept: string | null, now: number, seconds: number): SkimState {
  if (kept === 'question') return { phase: 'question' };
  const match = /^reading:(\d+)$/.exec(kept ?? '');
  const deadline = match ? Number(match[1]) : now + seconds * 1000;
  // A deadline further away than a whole countdown was not written here: start again.
  if (!Number.isSafeInteger(deadline) || deadline > now + seconds * 1000) {
    return { phase: 'reading', deadline: now + seconds * 1000 };
  }
  return deadline <= now ? { phase: 'question' } : { phase: 'reading', deadline };
}

/** Whole seconds left until `deadline`, never below zero. */
export function secondsLeft(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
