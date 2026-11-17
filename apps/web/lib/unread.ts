import type { DmUnread } from '@ft/shared';

/** Unread messages per conversation, keyed by the other user; none means 0. */
export type UnreadCounts = DmUnread['counts'];

/**
 * The tab's unread counts: the last dm:unread snapshot it kept. Like the
 * presence map, it lives as long as the tab's socket, not a page. A snapshot is
 * the whole picture, so it replaces the last one, unless it was counted before
 * it: two can cross on the way (a read and a new message at once), and the
 * later count must win whatever order they land in.
 */
export interface UnreadStore {
  /** Undefined until the first snapshot: the caller falls back to the server's render. */
  get(): UnreadCounts | undefined;
  apply(snapshot: DmUnread): void;
  /** Sign-out: the next user of this tab must not see the last one's counts. */
  clear(): void;
  subscribe(watch: () => void): () => void;
}

export function createUnreadStore(): UnreadStore {
  let kept: DmUnread | undefined;
  const watchers = new Set<() => void>();
  const changed = () => {
    for (const watch of watchers) watch();
  };

  return {
    get: () => kept?.counts,
    // Every snapshot kept is news, an unchanged one too: the thread reads
    // again on it, in case a message landed while its last read was out.
    apply(snapshot) {
      if (kept !== undefined && Date.parse(snapshot.at) < Date.parse(kept.at)) return;
      kept = snapshot;
      changed();
    },
    clear() {
      if (kept === undefined) return;
      kept = undefined;
      changed();
    },
    subscribe(watch) {
      watchers.add(watch);
      return () => {
        watchers.delete(watch);
      };
    },
  };
}

/** Every conversation's, for the account menu. */
export function unreadTotal(counts: UnreadCounts): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}
