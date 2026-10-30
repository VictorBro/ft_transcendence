import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { SessionUser } from '@ft/shared';

import type { PrismaService } from '../prisma/prisma.service';
import { CoursesService } from './courses.service';

/**
 * The three fields COURSE_SELECT asks for, and nothing else: a row shaped like
 * this is what CourseSchema.parse expects on the way out.
 */
const FRENCH = { lang: 'fr', level: 'B1', dailyGoal: 30 } as const;
const GERMAN = { lang: 'de', level: null, dailyGoal: 10 } as const;

/** Prisma surfaces its failures as objects carrying a `code`, never as Error subclasses. */
const prismaError = (code: string) => Object.assign(new Error(code), { code });

function serviceWith(prisma: Record<string, unknown>) {
  return new CoursesService(prisma as unknown as PrismaService);
}

describe('CoursesService listCoursesUser', () => {
  it('reads through the user, so another user is unreachable by construction', async () => {
    const findUnique = vi.fn().mockResolvedValue({ activeLang: 'fr', userLevels: [FRENCH] });
    const service = serviceWith({ user: { findUnique } });

    await service.listCoursesUser('user-1');

    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1' } }));
  });

  it('returns the courses under a product name, with the active language beside them', async () => {
    const service = serviceWith({
      user: { findUnique: vi.fn().mockResolvedValue({ activeLang: 'fr', userLevels: [FRENCH] }) },
    });

    await expect(service.listCoursesUser('user-1')).resolves.toEqual({
      courses: [FRENCH],
      activeLang: 'fr',
    });
  });

  /**
   * The discriminating case: onboarding is answered per (user, lang), never per
   * user. A learner who finished French still has to onboard German, and the
   * absence of a German row is the whole answer.
   */
  it('reports German as missing while French is complete', async () => {
    const service = serviceWith({
      user: { findUnique: vi.fn().mockResolvedValue({ activeLang: 'fr', userLevels: [FRENCH] }) },
    });

    const { courses } = await service.listCoursesUser('user-1');
    const langs = courses.map((course) => course.lang);

    expect(langs).toContain('fr');
    expect(langs).not.toContain('de');
  });

  // A live session pointing at a deleted account is not a missing course.
  it('rejects a session whose user no longer exists', async () => {
    const service = serviceWith({ user: { findUnique: vi.fn().mockResolvedValue(null) } });

    await expect(service.listCoursesUser('ghost')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('CoursesService createCourse', () => {
  it('starts a course with no level, since only placement sets one', async () => {
    const create = vi.fn().mockResolvedValue(GERMAN);
    const service = serviceWith({ userLevel: { create } });

    await expect(service.createCourse('user-1', { lang: 'de', dailyGoal: 10 })).resolves.toEqual(
      GERMAN,
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: 'user-1', lang: 'de', dailyGoal: 10, level: null },
      }),
    );
  });

  /**
   * Caught rather than pre-checked: a SELECT before the INSERT still races a
   * second onboarding, and the unique (userId, lang) is the only real arbiter.
   */
  it('turns the unique constraint into a conflict rather than overwriting the goal', async () => {
    const service = serviceWith({
      userLevel: { create: vi.fn().mockRejectedValue(prismaError('P2002')) },
    });

    const attempt = service.createCourse('user-1', { lang: 'fr', dailyGoal: 60 });

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    // The code, not the class: the browser renders anything else as "unknown".
    await expect(attempt).rejects.toMatchObject({ message: 'course.alreadyStarted' });
  });

  it('lets an unrelated database failure through instead of reporting a conflict', async () => {
    const service = serviceWith({
      userLevel: { create: vi.fn().mockRejectedValue(prismaError('P1001')) },
    });

    await expect(service.createCourse('user-1', { lang: 'fr', dailyGoal: 60 })).rejects.toThrow(
      'P1001',
    );
  });
});

describe('CoursesService setGoal', () => {
  /** The whole UserLevel row, as lockCourse reads it after the lock. */
  const LOCKED = {
    id: 'course-1',
    userId: 'user-1',
    lang: 'fr',
    level: 'B1',
    dailyGoal: 60,
    streak: 0,
    bestStreak: 0,
    lastGoalDay: null as Date | null,
    xp: 0,
    lastChallengeDay: null,
    challengesDone: 0,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  };
  const USER = { id: 'user-1', timeZone: 'UTC' } as SessionUser;
  const NOW = new Date('2026-10-12T12:00:00.000Z');

  /**
   * An interactive `$transaction` runs the callback with `tx`: here, mocks
   * for what setGoal, the goal.ts functions and award (#95) use. `doneCount`
   * is how many lessons were finished on the course day; every count answers
   * it, so the finished and passed stats of award read it too.
   */
  function goalService(locked: typeof LOCKED | null, doneCount = 0) {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue(locked === null ? [] : [{ id: locked.id }]),
      userLevel: {
        findUnique: vi.fn().mockResolvedValue(locked),
        update: vi.fn((args: { data: object }) => Promise.resolve({ ...locked, ...args.data })),
      },
      user: { update: vi.fn() },
      lessonResult: {
        findFirst: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(doneCount),
      },
      userAchievement: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn(),
      },
    };
    const prisma = { $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)) };
    return { service: serviceWith(prisma), tx };
  }

  it('locks the course, then writes the goal alone on it', async () => {
    const { service, tx } = goalService(LOCKED);

    await service.setGoal(USER, 'fr', { dailyGoal: 10 }, NOW);

    expect(tx.userLevel.update).toHaveBeenCalledWith({
      where: { id: 'course-1' },
      data: { dailyGoal: 10 },
    });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.userLevel.update.mock.invocationCallOrder[0],
    );
  });

  it('moves the active language onto the course it just wrote', async () => {
    const { service, tx } = goalService(LOCKED);

    await service.setGoal(USER, 'fr', { dailyGoal: 30 }, NOW);

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { activeLang: 'fr' },
    });
  });

  it('returns the course alone, never the streak or the ids', async () => {
    const { service } = goalService(LOCKED);

    await expect(service.setGoal(USER, 'fr', { dailyGoal: 30 }, NOW)).resolves.toEqual({
      ...FRENCH,
      dailyGoal: 30,
    });
  });

  // 60 to 30 minutes with three lessons done: the target drops from 6 to 3.
  it('meets the day when the lower goal is already reached', async () => {
    const { service, tx } = goalService(LOCKED, 3);

    await service.setGoal(USER, 'fr', { dailyGoal: 30 }, NOW);

    expect(tx.userLevel.update).toHaveBeenCalledWith({
      where: { id: 'course-1' },
      data: { streak: 1, bestStreak: 1, lastGoalDay: new Date('2026-10-12') },
    });
  });

  // award only increments xp: the streak meetGoal just wrote stays as it is.
  it('adds GOAL_XP, and nothing else, when the lower goal meets the day', async () => {
    const { service, tx } = goalService(LOCKED, 3);

    await service.setGoal(USER, 'fr', { dailyGoal: 30 }, NOW);

    expect(tx.userLevel.update).toHaveBeenLastCalledWith({
      where: { id: 'course-1' },
      data: { xp: { increment: 20 } },
    });
  });

  it('stores streak7 when the lower goal turns a streak of 6 into 7', async () => {
    const yesterday = { ...LOCKED, streak: 6, bestStreak: 6, lastGoalDay: new Date('2026-10-11') };
    const { service, tx } = goalService(yesterday, 3);
    tx.userAchievement.findMany.mockResolvedValue([{ code: 'firstLesson' }, { code: 'streak3' }]);

    await service.setGoal(USER, 'fr', { dailyGoal: 30 }, NOW);

    expect(tx.userAchievement.createMany).toHaveBeenCalledWith({
      data: [{ userLevelId: 'course-1', code: 'streak7', day: new Date('2026-10-12') }],
      skipDuplicates: true,
    });
  });

  it('writes no streak and no XP while the goal is not reached', async () => {
    const { service, tx } = goalService(LOCKED, 2);

    await service.setGoal(USER, 'fr', { dailyGoal: 30 }, NOW);

    expect(tx.userLevel.update).toHaveBeenCalledTimes(1);
  });

  it('turns a missing course into a not-found rather than creating one', async () => {
    const { service, tx } = goalService(null);

    const attempt = service.setGoal(USER, 'de', { dailyGoal: 30 }, NOW);

    await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
    await expect(attempt).rejects.toMatchObject({ message: 'course.notFound' });
    expect(tx.userLevel.update).not.toHaveBeenCalled();
  });

  it('lets a database failure through', async () => {
    const { service, tx } = goalService(LOCKED);
    tx.$queryRaw.mockRejectedValue(prismaError('P1001'));

    await expect(service.setGoal(USER, 'fr', { dailyGoal: 30 }, NOW)).rejects.toThrow('P1001');
  });
});

describe('CoursesService setLevel', () => {
  /** `$transaction` resolves a tuple, one entry per operation, in order. */
  function writingService(course: unknown) {
    const prisma = {
      userLevel: { update: vi.fn() },
      user: { update: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([course, { id: 'user-1' }]),
    };
    return { service: serviceWith(prisma), prisma };
  }

  it('writes the level alone, leaving the goal out of the update entirely', async () => {
    const { service, prisma } = writingService({ ...FRENCH, level: 'C1' });

    await service.setLevel('user-1', 'fr', { level: 'C1' });

    expect(prisma.userLevel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { level: 'C1' } }),
    );
  });

  it('addresses the course by the composite key, never by a primary key', async () => {
    const { service, prisma } = writingService(FRENCH);

    await service.setLevel('user-1', 'fr', { level: 'B1' });

    expect(prisma.userLevel.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_lang: { userId: 'user-1', lang: 'fr' } } }),
    );
  });

  // Same transaction as the course write, so activeLang can never point at a
  // language whose row did not actually change.
  it('moves the active language onto the course it just wrote', async () => {
    const { service, prisma } = writingService(FRENCH);

    await service.setLevel('user-1', 'fr', { level: 'B1' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { activeLang: 'fr' },
    });
  });

  // The second tuple entry is the full User row, password hash included.
  it('returns the course alone, never the user the transaction also updated', async () => {
    const { service } = writingService(FRENCH);

    await expect(service.setLevel('user-1', 'fr', { level: 'B1' })).resolves.toEqual(FRENCH);
  });

  it('turns a missing course into a not-found rather than creating one', async () => {
    const service = serviceWith({
      userLevel: { update: vi.fn() },
      user: { update: vi.fn() },
      $transaction: vi.fn().mockRejectedValue(prismaError('P2025')),
    });

    const attempt = service.setLevel('user-1', 'de', { level: 'A2' });

    await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
    await expect(attempt).rejects.toMatchObject({ message: 'course.notFound' });
  });

  it('lets an unrelated database failure through instead of reporting a missing course', async () => {
    const service = serviceWith({
      userLevel: { update: vi.fn() },
      user: { update: vi.fn() },
      $transaction: vi.fn().mockRejectedValue(prismaError('P1001')),
    });

    await expect(service.setLevel('user-1', 'fr', { level: 'B1' })).rejects.toThrow('P1001');
  });
});
