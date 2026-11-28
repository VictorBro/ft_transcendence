import type { DmUnread, FriendPending } from '@ft/shared';

/** Unread messages per conversation, keyed by the other user; none means 0. */
export type UnreadCounts = DmUnread['counts'];

/**
 * The last snapshot the tab kept of a count the server pushes whole: dm:unread
 * or friend:pending. Like the presence map, it lives as long as the tab's
 * socket, not a page. A snapshot is the whole picture, so it replaces the last
 * one, unless it was counted before it: two can cross on the way (a read and a
 * new message at once), and the later count must win whatever order they land in.
 */
export interface SnapshotStore<S extends { at: string }, T> {
  /** Undefined until the first snapshot: the caller falls back to the server's render. */
  get(): T | undefined;
  apply(snapshot: S): void;
  /** Sign-out: the next user of this tab must not see the last one's counts. */
  clear(): void;
  subscribe(watch: () => void): () => void;
}

/**
 * `pick` runs once per snapshot kept, so `get` hands useSyncExternalStore the
 * same value until the next one.
 */
export function createSnapshotStore<S extends { at: string }, T>(
  pick: (snapshot: S) => T,
): SnapshotStore<S, T> {
  let kept: { at: string; value: T } | undefined;
  const watchers = new Set<() => void>();
  const changed = () => {
    for (const watch of watchers) watch();
  };

  return {
    get: () => kept?.value,
    // Every snapshot kept is news, an unchanged one too: the thread reads
    // again on it, in case a message landed while its last read was out.
    apply(snapshot) {
      if (kept !== undefined && Date.parse(snapshot.at) < Date.parse(kept.at)) return;
      kept = { at: snapshot.at, value: pick(snapshot) };
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

export type UnreadStore = SnapshotStore<DmUnread, UnreadCounts>;

/** The tab's unread messages, per conversation. */
export const createUnreadStore = (): UnreadStore =>
  createSnapshotStore((snapshot: DmUnread) => snapshot.counts);

/** The friend requests waiting on the tab's user. */
export const createPendingStore = (): SnapshotStore<FriendPending, number> =>
  createSnapshotStore((snapshot: FriendPending) => snapshot.count);

/** The most a badge shows in digits. */
const BADGE_MAX = 99;

/** A badge's digits: 99+ past 99, so a large count cannot widen the header. */
export function badgeText(count: number): string {
  return count > BADGE_MAX ? `${BADGE_MAX}+` : String(count);
}

/** Every conversation's, for the account menu. */
export function unreadTotal(counts: UnreadCounts): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

/**
 * The account menu button's: unread messages and friend requests together.
 * Undefined while neither is known, so nothing flashes; a part not heard yet
 * counts as none until it is.
 */
export function menuTotal(
  unread: number | undefined,
  requests: number | undefined,
): number | undefined {
  return unread === undefined && requests === undefined
    ? undefined
    : (unread ?? 0) + (requests ?? 0);
}
