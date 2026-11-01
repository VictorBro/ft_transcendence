import { describe, expect, it, vi } from 'vitest';

import type { Prisma, UserLevel } from '../generated/prisma/client';
import { latestDay, lockCourse, meetGoal } from './goal';

/** A French course at goal 30 (3 lessons), its streak last met on 2026-10-11. */
const COURSE: UserLevel = {
  id: 'course-1',
  userId: 'user-1',
  lang: 'fr',
  level: 'A1',
  dailyGoal: 30,
  streak: 2,
  bestStreak: 5,
  lastGoalDay: new Date('2026-10-11'),
  xp: 0,
  lastChallengeDay: null,
  challengesDone: 0,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-11T18:00:00.000Z'),
};

describe('lockCourse', () => {
  it('locks the row with FOR UPDATE, then reads it through Prisma', async () => {
    const $queryRaw = vi.fn().mockResolvedValue([{ id: COURSE.id }]);
    const findUnique = vi.fn().mockResolvedValue(COURSE);
    const tx = { $queryRaw, userLevel: { findUnique } } as unknown as Prisma.TransactionClient;

    await expect(lockCourse(tx, 'user-1', 'fr')).resolves.toBe(COURSE);

    const [sql] = $queryRaw.mock.calls[0] as [TemplateStringsArray];
    expect(sql.join('?')).toContain('FOR UPDATE');
    expect($queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      findUnique.mock.invocationCallOrder[0],
    );
    expect(findUnique).toHaveBeenCalledWith({
      where: { userId_lang: { userId: 'user-1', lang: 'fr' } },
    });
  });
});

describe('meetGoal', () => {
  /** `doneCount` is how many lessons the course finished on the day asked. */
  const fakeTx = (doneCount: number) => {
    const update = vi.fn();
    const tx = {
      lessonResult: { count: vi.fn().mockResolvedValue(doneCount) },
      userLevel: { update },
    } as unknown as Prisma.TransactionClient;
    return { tx, update };
  };

  it('meets the day after the last one met: the streak goes on and is written', async () => {
    const { tx, update } = fakeTx(3);

    await expect(meetGoal(tx, COURSE, '2026-10-12')).resolves.toEqual({
      justMet: true,
      doneCount: 3,
      streak: 3,
      bestStreak: 5,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'course-1' },
      data: { streak: 3, bestStreak: 5, lastGoalDay: new Date('2026-10-12') },
    });
  });

  it('writes nothing while the goal is not reached', async () => {
    const { tx, update } = fakeTx(2);

    await expect(meetGoal(tx, COURSE, '2026-10-12')).resolves.toEqual({
      justMet: false,
      doneCount: 2,
      streak: 2,
      bestStreak: 5,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('never meets the same day twice', async () => {
    const { tx, update } = fakeTx(4);

    await expect(meetGoal(tx, COURSE, '2026-10-11')).resolves.toMatchObject({
      justMet: false,
      streak: 2,
    });
    expect(update).not.toHaveBeenCalled();
  });

  // currentDay never gives such a day, but a caller with its own clock could:
  // lastGoalDay must not go back, and nothing is met.
  it('never moves lastGoalDay back to a day before it', async () => {
    const { tx, update } = fakeTx(3);

    await expect(meetGoal(tx, COURSE, '2026-10-10')).resolves.toMatchObject({
      justMet: false,
      streak: 2,
    });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('latestDay', () => {
  it('gives the newest day, skipping the missing ones', () => {
    expect(latestDay([new Date('2026-10-11'), null, undefined, new Date('2026-10-12')])).toBe(
      '2026-10-12',
    );
  });

  it('gives null without any day', () => {
    expect(latestDay([null, undefined])).toBeNull();
  });
});
