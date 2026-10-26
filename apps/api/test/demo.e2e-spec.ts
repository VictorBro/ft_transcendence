import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Today } from '@ft/shared';

import { AuthService } from '../src/auth/auth.service';
import { CoursesService } from '../src/courses/courses.service';
import { atLocalTime } from '../src/demo/demo.clock';
import { DEMO_PROFILES, type DemoProfile } from '../src/demo/demo.data';
import { type DemoServices, replayLearner } from '../src/demo/demo';
import { planCourse } from '../src/demo/demo.planner';
import type { Prisma } from '../src/generated/prisma/client';
import { dayOf } from '../src/lessons/goal';
import { LessonsService } from '../src/lessons/lessons.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * The demo learners' replay (#85) against a real Postgres, with the services
 * built by hand as the seed builds them. Never the demo learners themselves:
 * ben's and chloe's profiles under replay-<stamp> identities, and never the
 * seed's entry point, which would delete every demo-* user of the database.
 *
 * The run instant is injected: 3 minutes past midnight in Tokyo, so chloe's
 * first finish today lands just after her local midnight, still the day
 * before in UTC.
 */
describe('demo learners replay (e2e)', () => {
  const stamp = Date.now();
  const DAY = '2026-10-26';
  const RUN_NOW = new Date(atLocalTime(DAY, 0, 'Asia/Tokyo').getTime() + 3 * 60_000);
  const PASSWORD = 'Correct-Horse-9';

  let prisma: PrismaService;
  let services: DemoServices;
  const emails: string[] = [];
  let fixtureIds: string[] = [];

  const profile = (name: string): DemoProfile => DEMO_PROFILES.find((p) => p.name === name)!;

  /** The profile's French course. */
  const french = (name: string) => profile(name).courses.find((course) => course.lang === 'fr')!;

  /** How many finishes a profile's French course replays, today's included. */
  const finishCount = (name: string) =>
    planCourse('x@example.com', 'UTC', french(name), RUN_NOW, []).reduce(
      (sum, day) => sum + day.finishes.length,
      0,
    );

  /** Letters only in lesson ids: an index as base-26 letters, aa, ab… */
  const letters = (index: number) =>
    String.fromCharCode(97 + Math.floor(index / 26)) + String.fromCharCode(97 + (index % 26));

  const fixture = (index: number): Prisma.LessonCreateManyInput => ({
    id: `fr-test-demo-${letters(index)}`,
    lang: 'fr',
    level: 'A1',
    // After the real lessons of the level, and after finish.e2e-spec's.
    position: 9201 + index,
    kind: 'grammar',
    topic: 'pronouns',
    theme: null,
    title: 'Une leçon du testeur',
    summary: 'Une leçon de test.',
    brief: { objective: 'test', points: [], examples: [], pitfalls: [], vocabulary: [] },
  });

  /**
   * Replays a profile's French course under its own identity, and returns
   * the user's id. French only: every state checked is on French A1, and the
   * extras' levels hold no lesson when this file runs before seed.e2e-spec.
   */
  const replay = async (name: string): Promise<string> => {
    const email = `replay-${name}-${stamp}@example.com`;
    emails.push(email);
    await replayLearner(
      services,
      { email, displayName: `replay${stamp}${name}`, password: PASSWORD },
      { ...profile(name), courses: [french(name)] },
      RUN_NOW,
    );
    return (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  };

  const today = (userId: string, timeZone: string): Promise<Today> =>
    services.lessons.today(userId, 'fr', timeZone, RUN_NOW);

  beforeAll(async () => {
    prisma = new PrismaService();
    services = {
      prisma,
      auth: new AuthService(prisma),
      courses: new CoursesService(prisma),
      lessons: new LessonsService(prisma),
    };

    // What an interrupted run may have left: its users first, their results
    // block the lessons (Restrict).
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'replay-', endsWith: '@example.com' } },
    });
    await prisma.lesson.deleteMany({ where: { id: { startsWith: 'fr-test-demo-' } } });

    // CI seeds no lesson. A level with fewer lessons than the profiles finish
    // would make them redo lessons, which is not the story they tell.
    const held = await prisma.lesson.count({ where: { lang: 'fr', level: 'A1' } });
    const needed = Math.max(finishCount('ben'), finishCount('chloe'));
    const fixtures = Array.from({ length: Math.max(0, needed - held) }, (_, i) => fixture(i));
    fixtureIds = fixtures.map((row) => row.id);
    await prisma.lesson.createMany({ data: fixtures });
  });

  afterAll(async () => {
    // The users first: their courses and results cascade, then nothing blocks the lessons.
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.lesson.deleteMany({ where: { id: { in: fixtureIds } } });
    await prisma.$disconnect();
  });

  it('replays ben: a 12-day streak to keep, 1 of 3 today, A1 kept through a level switch', async () => {
    const userId = await replay('ben');
    const page = await today(userId, 'America/New_York');
    const held = await prisma.lesson.count({ where: { lang: 'fr', level: 'A1' } });

    expect(page.streak).toEqual({ current: 12, best: 20, today: false });
    expect(page.done).toHaveLength(1);
    expect(page.done[0].score).toBe(75);
    expect(page.target).toBe(3);
    // Progress over what the level holds, real lessons and fixtures alike.
    expect(page.progress.total).toBe(held);
    expect(page.progress.attempted).toBeGreaterThan(0);

    // The switch to A2 and back left him on A1 with every A1 result.
    const course = await prisma.userLevel.findUniqueOrThrow({
      where: { userId_lang: { userId, lang: 'fr' } },
      include: { _count: { select: { lessonResults: true } } },
    });
    expect(course.level).toBe('A1');
    expect(course._count.lessonResults).toBe(page.progress.attempted);
  });

  it('replays chloe: streak lost, best 21, today 2 of 3 with one failed', async () => {
    const userId = await replay('chloe');
    const page = await today(userId, 'Asia/Tokyo');

    expect(page.day).toBe(DAY);
    expect(page.streak).toEqual({ current: 0, best: 21, today: false });
    expect(page.done.map((card) => card.score)).toEqual([85, 40]);
    expect(page.done.map((card) => card.status)).toEqual(['done', 'failed']);
  });

  it("stores chloe's finish just after her local midnight on her day, not UTC's", async () => {
    const course = await prisma.userLevel.findFirstOrThrow({
      where: { lang: 'fr', user: { email: `replay-chloe-${stamp}@example.com` } },
    });
    const first = await prisma.lessonResult.findFirstOrThrow({
      where: { userLevelId: course.id },
      orderBy: { finishedAt: 'desc' },
      skip: 1,
    });

    // Her first finish today: 00:01 in Tokyo, 15:01 the day before in UTC.
    expect(first.finishedAt.toISOString().slice(0, 10)).toBe('2026-10-25');
    expect(dayOf(first.day)).toBe(DAY);
  });
});
