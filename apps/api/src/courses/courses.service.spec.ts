import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

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

    await expect(
      service.createCourse('user-1', { lang: 'fr', dailyGoal: 60 }),
    ).rejects.toBeInstanceOf(ConflictException);
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

describe('CoursesService setGoal and setLevel', () => {
  /** `$transaction` resolves a tuple, one entry per operation, in order. */
  function writingService(course: unknown) {
    const prisma = {
      userLevel: { update: vi.fn() },
      user: { update: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([course, { id: 'user-1' }]),
    };
    return { service: serviceWith(prisma), prisma };
  }

  it('writes the goal alone, leaving the level out of the update entirely', async () => {
    const { service, prisma } = writingService({ ...FRENCH, dailyGoal: 10 });

    await service.setGoal('user-1', 'fr', { dailyGoal: 10 });

    expect(prisma.userLevel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { dailyGoal: 10 } }),
    );
  });

  it('writes the level alone, leaving the goal out of the update entirely', async () => {
    const { service, prisma } = writingService({ ...FRENCH, level: 'C1' });

    await service.setLevel('user-1', 'fr', { level: 'C1' });

    expect(prisma.userLevel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { level: 'C1' } }),
    );
  });

  it('addresses the course by the composite key, never by a primary key', async () => {
    const { service, prisma } = writingService(FRENCH);

    await service.setGoal('user-1', 'fr', { dailyGoal: 30 });

    expect(prisma.userLevel.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_lang: { userId: 'user-1', lang: 'fr' } } }),
    );
  });

  // Same transaction as the course write, so activeLang can never point at a
  // language whose row did not actually change.
  it('moves the active language onto the course it just wrote', async () => {
    const { service, prisma } = writingService(FRENCH);

    await service.setGoal('user-1', 'fr', { dailyGoal: 30 });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { activeLang: 'fr' },
    });
  });

  // The second tuple entry is the full User row, password hash included.
  it('returns the course alone, never the user the transaction also updated', async () => {
    const { service } = writingService(FRENCH);

    await expect(service.setGoal('user-1', 'fr', { dailyGoal: 30 })).resolves.toEqual(FRENCH);
  });

  it('turns a missing course into a not-found rather than creating one', async () => {
    const service = serviceWith({
      userLevel: { update: vi.fn() },
      user: { update: vi.fn() },
      $transaction: vi.fn().mockRejectedValue(prismaError('P2025')),
    });

    await expect(service.setGoal('user-1', 'de', { dailyGoal: 30 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.setLevel('user-1', 'de', { level: 'A2' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lets an unrelated database failure through instead of reporting a missing course', async () => {
    const service = serviceWith({
      userLevel: { update: vi.fn() },
      user: { update: vi.fn() },
      $transaction: vi.fn().mockRejectedValue(prismaError('P1001')),
    });

    await expect(service.setGoal('user-1', 'fr', { dailyGoal: 30 })).rejects.toThrow('P1001');
  });
});
