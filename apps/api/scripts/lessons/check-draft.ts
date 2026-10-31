/**
 * The check both ways of writing a lesson share (#83): lessons:author after
 * each model reply, lessons:check after each draft the /author-lessons
 * skill writes.
 *
 *   draft ─→ complete() ─→ validateLesson ─→ title not taken? ─→ ok, the files to write
 *                                                              or every issue
 */
import { foldText, lessons } from '@ft/shared';

import { complete, type CompleteContext, type Draft } from './complete';

export interface Issue {
  path: string;
  message: string;
}

export interface DraftCheck {
  /** The draft after complete(): what the next edits apply to. */
  completed: Draft;
  issues: Issue[];
  /** The parsed files to write, when there is no issue. */
  files?: { brief: unknown; content: unknown; title: string };
}

/**
 * Completes and validates `draft`. `usedTitles` maps the folded titles
 * already taken in the course language to their lesson id; the lesson's own
 * id is skipped, so checking a written lesson does not flag its own title.
 */
export function checkDraft(
  draft: Draft,
  ctx: CompleteContext,
  usedTitles: Map<string, { title: string; id: string }>,
): DraftCheck {
  const completed = complete(draft, ctx);
  const result = lessons.validateLesson(completed.brief, completed.content, ctx);
  if (!result.ok) return { completed, issues: result.issues };

  const taken = usedTitles.get(foldText(result.title));
  if (taken && taken.id !== ctx.entry.id)
    return {
      completed,
      issues: [
        { path: 'brief.title', message: `"${taken.title}" is already the title of ${taken.id}` },
      ],
    };
  return {
    completed,
    issues: [],
    files: { brief: result.brief, content: result.content, title: result.title },
  };
}
