import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';

import { RedisService } from '../redis/redis.service';

/** Long enough for a reload to open its new socket before friends see you leave. */
export const PRESENCE_GRACE_MS = 10_000;

const presenceKey = (userId: string): string => `presence:${userId}`;

/**
 * How many sockets each user holds, in Redis so it holds across API instances.
 * Answers questions only: telling the friends is the gateway's job.
 */
@Injectable()
export class PresenceService implements OnApplicationBootstrap {
  constructor(private readonly redis: RedisService) {}

  /**
   * No socket survives a restart, but Redis keeps the counts a crash never
   * took back: start every count at zero. Assumes one API instance.
   */
  async onApplicationBootstrap(): Promise<void> {
    for await (const keys of this.redis.client.scanIterator({ MATCH: 'presence:*' })) {
      if (keys.length > 0) await this.redis.client.del(keys);
    }
  }

  /** A socket opened. True when it is the user's only one: they just came online. */
  async connected(userId: string): Promise<boolean> {
    const count = await this.redis.client.incr(presenceKey(userId));
    return count === 1;
  }

  /** A socket closed. Resolves after the grace period, true when the user has no socket left. */
  async disconnected(userId: string): Promise<boolean> {
    const count = await this.redis.client.decr(presenceKey(userId));
    if (count > 0) return false;

    if (count < 0) await this.redis.client.set(presenceKey(userId), '0');

    // unref: a pending wait must not hold the process open on shutdown.
    await new Promise((resolve) => setTimeout(resolve, PRESENCE_GRACE_MS).unref());
    const now = await this.redis.client.get(presenceKey(userId));
    return Number(now) <= 0;
  }

  /** The ids among `ids` that hold a socket, for the REST routes. */
  async isOnline(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();

    const counts = await this.redis.client.mGet(ids.map(presenceKey));

    return new Set(ids.filter((id, i) => Number(counts[i]) > 0));
  }
}
