import { ThrottlerStorageService } from '@nestjs/throttler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('throttler storage bucket isolation', () => {
  let storage: ThrottlerStorageService;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = new ThrottlerStorageService();
  });

  afterEach(() => {
    storage.onApplicationShutdown();
    vi.useRealTimers();
  });

  it('expires signup hits after another route finishes a rate-limit block', async () => {
    const hit = (key: string, limit: number) =>
      storage.increment(key, 60_000, limit, 60_000, 'default');

    await hit('lesson', 1);
    expect((await hit('lesson', 1)).isBlocked).toBe(true);

    await vi.advanceTimersByTimeAsync(10_000);
    for (let i = 0; i < 10; i += 1) await hit('signup', 10);

    // The lesson unblocks before the signup hits expire. Its reset must not
    // cancel signup's expiry timers, or the next signup burst gets a false 429.
    await vi.advanceTimersByTimeAsync(50_001);
    expect((await hit('lesson', 1)).isBlocked).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);

    for (let i = 0; i < 10; i += 1) {
      expect((await hit('signup', 10)).isBlocked).toBe(false);
    }
    expect((await hit('signup', 10)).isBlocked).toBe(true);
  });
});
