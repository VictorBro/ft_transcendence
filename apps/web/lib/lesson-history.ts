/** Mark only navigation from a lesson page, never a direct player visit or retake from results. */
let pendingSource: string | null = null;
const marker = 'ftLessonSource';

export function preparePlayerNavigation(playPath: string) {
  const lessonPath = playPath.replace(/\/play$/, '');
  pendingSource = window.location.pathname.endsWith(lessonPath) ? window.location.pathname : null;
}

/** Keep the origin on this history entry, including across a reload or Forward. */
export function recordPlayerOrigin(pagePath: string) {
  if (pendingSource?.endsWith(pagePath) && window.location.pathname.endsWith(`${pagePath}/play`)) {
    window.history.replaceState({ ...window.history.state, [marker]: pendingSource }, '');
  }
  pendingSource = null;
}

export function playerHasLessonOrigin(pagePath: string): boolean {
  const source: unknown = window.history.state?.[marker];
  return typeof source === 'string' && source.endsWith(pagePath);
}
