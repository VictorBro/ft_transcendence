import type { lessons } from '@ft/shared';

type AttemptView = lessons.player.AttemptView;

/**
 * Where a page found the attempt when the server rendered it: its id and
 * page, null once finished. Shared by the lesson pages (server) and the
 * tab memory (browser), so it imports neither side.
 */
export interface Cursor {
  attemptId: string;
  index: number | null;
}

export const cursorOf = (attempt: AttemptView | null): Cursor | null =>
  attempt === null ? null : { attemptId: attempt.attemptId, index: attempt.current?.index ?? null };
