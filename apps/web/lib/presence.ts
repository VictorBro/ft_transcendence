import type { PresenceUpdate } from '@ft/shared';

/**
 * What the tab last heard about each friend: online or not. It lives as long
 * as the tab's socket, not as long as a page, so a page that Next restores
 * from its client cache on Back still shows what happened while it was away.
 * An id the tab has heard nothing about reads undefined: the caller falls back
 * to the value the server rendered.
 */
export interface PresenceMap {
  get(userId: string): boolean | undefined;
  /** A presence:update, from the snapshot on connect or a friend coming or going. */
  apply(update: PresenceUpdate): void;
  /**
   * friend:removed, no longer a friend; friend:accepted, a new friend the
   * refreshed render knows better than any older entry.
   */
  forget(userId: string): void;
  /**
   * Sign-out: the next user of this tab must not inherit the last one's
   * friends. Connect: its snapshot replaces whatever the tab heard before.
   */
  clear(): void;
  subscribe(watch: () => void): () => void;
}

export function createPresenceMap(): PresenceMap {
  const online = new Map<string, boolean>();
  const watchers = new Set<() => void>();
  const changed = () => {
    for (const watch of watchers) watch();
  };

  return {
    get: (userId) => online.get(userId),
    apply(update) {
      const next = update.status === 'online';
      if (online.get(update.userId) === next) return;
      online.set(update.userId, next);
      changed();
    },
    forget(userId) {
      if (online.delete(userId)) changed();
    },
    clear() {
      if (online.size === 0) return;
      online.clear();
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
