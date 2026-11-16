import { describe, expect, it } from 'vitest';

import { serialQueue } from './serial-queue';

const later = <T>(value: T, ms: number) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe('serialQueue', () => {
  it('starts a task only once the one before it has finished', async () => {
    const run = serialQueue();
    const log: string[] = [];

    const slow = run(async () => {
      log.push('slow start');
      await later(null, 20);
      log.push('slow end');
      return 'slow';
    });
    const fast = run(async () => {
      log.push('fast start');
      return 'fast';
    });

    await expect(Promise.all([slow, fast])).resolves.toEqual(['slow', 'fast']);
    expect(log).toEqual(['slow start', 'slow end', 'fast start']);
  });

  it('runs the next task after one that fails, and keeps the failure for its caller', async () => {
    const run = serialQueue();

    const failed = run(() => Promise.reject(new Error('refused')));
    const next = run(() => Promise.resolve('next'));

    await expect(failed).rejects.toThrow('refused');
    await expect(next).resolves.toBe('next');
  });
});
