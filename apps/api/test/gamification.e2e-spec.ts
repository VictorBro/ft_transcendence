import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ACHIEVEMENTS,
  type ChallengeCode,
  LESSON_KINDS,
  type LessonKind,
  type Theme,
} from '@ft/shared';

import { AppModule } from '../src/app.module';
import type { Prisma } from '../src/generated/prisma/client';
import { configureApp } from '../src/app.setup';
import { challengeFor } from '../src/lessons/gamification.rules';
import { localDay, previousDay } from '../src/lessons/roadmap.rules';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * XP, the daily challenge and the achievements (#95), end to end.
 *
 * The challenge is a hash of the course id and the day, so it changes with
 * every learner. Each story reads its course's challenge first, then picks
 * lessons and scores that miss it, except where a story meets it on
 * purpose. That way every XP number below is exact:
 *   a first finish at 80 → LESSON_XP 10 + 80 points = 90
 *   meeting the goal     → + GOAL_XP 20
 *   doing the challenge  → + CHALLENGE_XP 30
 *
 * The clock is frozen at noon UTC, as in finish.e2e-spec.ts.
 */
describe('XP, challenge and achievements (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const stamp = Date.now();
  const emails: string[] = [];

  const today = localDay(new Date(), 'UTC');
  const NOON = new Date(`${today}T12:00:00.000Z`);

  /** Letters only in the ids: LESSON_ID_PATTERN refuses digits. */
  const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const THEMES: Record<Exclude<LessonKind, 'grammar'>, Theme> = {
    vocabulary: 'food_and_drink',
    functions: 'relations',
    reading: 'daily_life',
  };

  /** Ten French A1 lessons of each kind, after the real ones of the level. */
  const FIXTURES: Prisma.LessonCreateManyInput[] = LESSON_KINDS.flatMap((kind, k) =>
    LETTERS.map((letter, index) => ({
      id: `fr-test-gam-${kind}-${letter}`,
      lang: 'fr' as const,
      level: 'A1' as const,
      position: 9301 + k * LETTERS.length + index,
      kind,
      topic: kind === 'grammar' ? ('pronouns' as const) : null,
      theme: kind === 'grammar' ? null : THEMES[kind],
      title: 'Une leçon du testeur',
      summary: 'Une leçon de test.',
      brief: { objective: 'test', points: [], examples: [], pitfalls: [], vocabulary: [] },
    })),
  );
  const FIXTURE_IDS = FIXTURES.map((fixture) => fixture.id);

  const server = () => app.getHttpServer();

  /** A fresh learner, placed in French A1 at that goal, and their course's challenge today. */
  const learner = async (name: string, dailyGoal: 10 | 30 | 60) => {
    const email = `gamification-${name}-${stamp}@example.com`;
    emails.push(email);
    const agent = request.agent(server());
    await agent
      .post('/api/auth/signup')
      .send({ email, displayName: `gam${name}${stamp}`, password: 'Correct-Horse-9' })
      .expect(201);
    await agent.post('/api/courses').send({ lang: 'fr', dailyGoal }).expect(201);
    await agent.patch('/api/courses/fr/level').send({ level: 'A1' }).expect(200);

    const course = await prisma.userLevel.findFirstOrThrow({
      where: { user: { email }, lang: 'fr' },
    });
    return { agent, email, courseId: course.id, challenge: challengeFor(course.id, today) };
  };

  /**
   * Hands out fixture lessons, never the same one twice per learner. `miss`
   * gives a kind the challenge does not ask for; `meet` gives the kind it
   * asks for, or any kind for score90 and beyondGoal (those depend on the
   * score and the count, which the story chooses).
   */
  const lessonsFor = (challenge: ChallengeCode) => {
    const used = new Set<string>();
    const take = (kinds: readonly LessonKind[]) => {
      const id = FIXTURE_IDS.find(
        (candidate) =>
          !used.has(candidate) &&
          kinds.some((kind) => candidate.startsWith(`fr-test-gam-${kind}-`)),
      );
      if (id === undefined) {
        throw new Error('not enough fixture lessons');
      }
      used.add(id);
      return id;
    };
    return {
      miss: () => take(LESSON_KINDS.filter((kind) => kind !== challenge)),
      meet: () =>
        take(
          LESSON_KINDS.filter(
            (kind) => kind === challenge || !LESSON_KINDS.includes(challenge as LessonKind),
          ),
        ),
    };
  };

  /** A score that misses the challenge, and one that meets it, for a lesson `meet` gave. */
  const MISS_SCORE = 80;
  const meetScore = (challenge: ChallengeCode) => (challenge === 'score90' ? 95 : 80);

  const finish = (agent: TestAgent, id: string, score = MISS_SCORE) =>
    agent.put(`/api/courses/fr/lessons/${id}/result`).send({ score });

  const course = (courseId: string) =>
    prisma.userLevel.findUniqueOrThrow({ where: { id: courseId } });

  /** The streak as if the goal was met for the six days up to yesterday. */
  const streakOfSix = (courseId: string) =>
    prisma.userLevel.update({
      where: { id: courseId },
      data: { streak: 6, bestStreak: 6, lastGoalDay: new Date(previousDay(today)) },
    });

  /** Waits until `count` sessions wait behind the session `blocker`, as in finish.e2e-spec.ts. */
  const waitForBlocked = (blocker: number, count: number) =>
    vi.waitFor(
      async () => {
        const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
          WITH RECURSIVE behind(pid) AS (
            SELECT pid FROM pg_stat_activity WHERE ${blocker}::int = ANY(pg_blocking_pids(pid))
            UNION
            SELECT activity.pid FROM pg_stat_activity activity
            JOIN behind ON behind.pid = ANY(pg_blocking_pids(activity.pid))
          )
          SELECT count(*)::int AS waiting FROM behind`;
        expect(waiting).toBe(count);
      },
      { timeout: 4_000, interval: 20 },
    );

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    vi.setSystemTime(NOON);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    // What an interrupted run may have left: its results first, Restrict blocks the lessons.
    await prisma.lessonResult.deleteMany({ where: { lessonId: { in: FIXTURE_IDS } } });
    await prisma.lesson.deleteMany({ where: { id: { in: FIXTURE_IDS } } });
    await prisma.lesson.createMany({ data: FIXTURES });
  });

  afterAll(async () => {
    // The users first: their courses, results and achievements cascade.
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.lesson.deleteMany({ where: { id: { in: FIXTURE_IDS } } });
    await app.close();
    vi.useRealTimers();
  });

  /**
   * Goal 10 (one lesson), so the first finish meets the day and the next two
   * are both beyond it: whatever the challenge, both of them do it. The
   * course row is held until both wait on it, then let go at once.
   */
  it('awards the challenge once when two finishes that both do it arrive together', async () => {
    const { agent, courseId, challenge } = await learner('race', 10);
    const pick = lessonsFor(challenge);
    const first = await finish(agent, pick.miss()).expect(200);
    expect(first.body).toMatchObject({ xpGained: 90 + 20, challengeJustDone: false });

    let sent!: Promise<Awaited<ReturnType<typeof finish>>[]>;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "UserLevel" WHERE id = ${courseId}::uuid FOR UPDATE`;
      const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      sent = Promise.all([
        finish(agent, pick.meet(), meetScore(challenge)).expect(200),
        finish(agent, pick.meet(), meetScore(challenge)).expect(200),
      ]);
      await waitForBlocked(pid, 2);
    });
    const both = await sent;
    const lesson = 10 + meetScore(challenge);

    expect(both.map((response) => response.body.challengeJustDone).sort()).toEqual([false, true]);
    expect(both.map((response) => response.body.xpGained).sort((a, b) => a - b)).toEqual([
      lesson,
      lesson + 30,
    ]);
    expect(await course(courseId)).toMatchObject({
      xp: 110 + 2 * lesson + 30,
      challengesDone: 1,
      lastChallengeDay: new Date(today),
    });
  });

  it('adds GOAL_XP to the finish that meets a goal of 30, and only to that one', async () => {
    const { agent, challenge } = await learner('goal', 30);
    const pick = lessonsFor(challenge);

    const gains = [];
    for (let index = 0; index < 3; index += 1) {
      gains.push((await finish(agent, pick.miss()).expect(200)).body.xpGained);
    }

    expect(gains).toEqual([90, 90, 110]);
  });

  it('adds GOAL_XP once when the goal drops from 60 to 30 after three finishes', async () => {
    const { agent, courseId, challenge } = await learner('lower', 60);
    const pick = lessonsFor(challenge);
    for (let index = 0; index < 3; index += 1) {
      await finish(agent, pick.miss()).expect(200);
    }
    expect((await course(courseId)).xp).toBe(270);

    await agent.patch('/api/courses/fr').send({ dailyGoal: 30 }).expect(200);
    expect((await course(courseId)).xp).toBe(290);

    await agent.patch('/api/courses/fr').send({ dailyGoal: 60 }).expect(200);
    await agent.patch('/api/courses/fr').send({ dailyGoal: 30 }).expect(200);
    expect((await course(courseId)).xp).toBe(290);
  });

  it('stores streak7 when a lower goal turns a streak of 6 into 7', async () => {
    const { agent, courseId, challenge } = await learner('lower-streak', 60);
    const pick = lessonsFor(challenge);
    for (let index = 0; index < 3; index += 1) {
      await finish(agent, pick.miss()).expect(200);
    }
    await streakOfSix(courseId);

    await agent.patch('/api/courses/fr').send({ dailyGoal: 30 }).expect(200);

    const stored = await prisma.userAchievement.findUnique({
      where: { userLevelId_code: { userLevelId: courseId, code: 'streak7' } },
    });
    expect(stored).toMatchObject({ day: new Date(today) });
  });

  it('gains nothing for a lower redo on the same day, and never loses XP', async () => {
    const { agent, courseId, challenge } = await learner('redo', 30);
    const id = lessonsFor(challenge).miss();
    await finish(agent, id, 80).expect(200);

    const redo = await finish(agent, id, 50).expect(200);

    expect(redo.body).toMatchObject({ countedToday: false, xpGained: 0, newAchievements: [] });
    expect((await course(courseId)).xp).toBe(90);
  });

  it('returns streak7 from the finish that turns a streak of 6 into 7, and only once', async () => {
    const { agent, courseId, challenge } = await learner('streak', 10);
    const id = lessonsFor(challenge).miss();
    await streakOfSix(courseId);

    const first = await finish(agent, id).expect(200);
    // The same lesson again: the count stays at 1, so beyondGoal stays out of reach too.
    const second = await finish(agent, id).expect(200);

    expect(first.body.newAchievements).toEqual(['firstLesson', 'streak3', 'streak7']);
    expect(second.body.newAchievements).toEqual([]);
    const rows = await prisma.userAchievement.findMany({ where: { userLevelId: courseId } });
    expect(rows.map((row) => row.code).sort()).toEqual(['firstLesson', 'streak3', 'streak7']);
  });

  /**
   * Every French A1 lesson the database holds, seeded or fixture, gets a
   * result written straight to the table, but one: the finish of that last
   * one completes the level. The user's delete in afterAll takes the results.
   */
  it('returns levelA1 from the finish that completes French A1', async () => {
    const { agent, courseId, challenge } = await learner('level', 10);
    const last = lessonsFor(challenge).miss();
    const level = await prisma.lesson.findMany({
      where: { lang: 'fr', level: 'A1', id: { not: last } },
      select: { id: true },
    });
    await prisma.lessonResult.createMany({
      data: level.map((lesson) => ({
        userLevelId: courseId,
        lessonId: lesson.id,
        score: 100,
        day: new Date(previousDay(today)),
        finishedAt: new Date(`${previousDay(today)}T12:00:00.000Z`),
      })),
    });

    const response = await finish(agent, last).expect(200);

    expect(response.body.newAchievements).toContain('levelA1');
  });

  it('shows the rank, the challenge and what was earned today', async () => {
    const { agent, challenge } = await learner('today', 30);
    const pick = lessonsFor(challenge);
    // Goal 30 is 3 lessons. One that misses, then the one that does it; for
    // beyondGoal, three that miss first, so the fourth is beyond the goal.
    await finish(agent, pick.miss()).expect(200);
    if (challenge === 'beyondGoal') {
      await finish(agent, pick.miss()).expect(200);
      await finish(agent, pick.miss()).expect(200);
    }
    const done = await finish(agent, pick.meet(), meetScore(challenge)).expect(200);
    expect(done.body.challengeJustDone).toBe(true);

    const response = await agent.get('/api/courses/fr/today').expect(200);

    expect(response.body.challenge).toEqual({ code: challenge, done: true });
    expect(response.body.earnedToday).toEqual(['firstLesson']);
    expect(response.body.xp).toMatchObject({ rank: expect.any(Number) });
    expect(response.body.xp.rankStart).toBeLessThanOrEqual(response.body.xp.total);
    expect(response.body.xp.total).toBeLessThan(response.body.xp.nextRankAt);
  });

  it('lists the sixteen achievements, the earned ones with their day', async () => {
    const { agent, challenge } = await learner('list', 30);
    await finish(agent, lessonsFor(challenge).miss()).expect(200);

    const response = await agent.get('/api/courses/fr/achievements').expect(200);
    const items: { code: string; day: string | null; current: number; target: number }[] =
      response.body.items;

    expect(items.map((item) => item.code)).toEqual(
      ACHIEVEMENTS.map((achievement) => achievement.code),
    );
    expect(items.find((item) => item.code === 'firstLesson')).toMatchObject({
      day: today,
      current: 1,
      target: 1,
    });
    expect(items.find((item) => item.code === 'passed25')).toMatchObject({
      day: null,
      current: 1,
      target: 25,
    });
    expect(items.find((item) => item.code === 'levelA1')).toMatchObject({
      day: null,
      level: { attempted: 1, passed: 1 },
    });
  });

  it('answers the achievements route like the reads: 404, then 409 before placement', async () => {
    const email = `gamification-lookup-${stamp}@example.com`;
    emails.push(email);
    const agent = request.agent(server());
    await agent
      .post('/api/auth/signup')
      .send({ email, displayName: `gamlookup${stamp}`, password: 'Correct-Horse-9' })
      .expect(201);

    const missing = await agent.get('/api/courses/fr/achievements').expect(404);
    await agent.post('/api/courses').send({ lang: 'fr', dailyGoal: 10 }).expect(201);
    const unplaced = await agent.get('/api/courses/fr/achievements').expect(409);

    expect(missing.body.message).toBe('course.notFound');
    expect(unplaced.body.message).toBe('course.notPlaced');
  });

  it('removes the achievements with the user', async () => {
    const { agent, email, courseId, challenge } = await learner('delete', 10);
    await finish(agent, lessonsFor(challenge).miss()).expect(200);
    expect(
      await prisma.userAchievement.count({ where: { userLevelId: courseId } }),
    ).toBeGreaterThan(0);

    await prisma.user.delete({ where: { email } });

    expect(await prisma.userAchievement.count({ where: { userLevelId: courseId } })).toBe(0);
  });

  it('documents the route and the new fields in Swagger', async () => {
    const response = await request(server()).get('/api/docs-json').expect(200);
    const docs = JSON.stringify(response.body);

    expect(response.body.paths['/api/courses/{lang}/achievements']).toHaveProperty('get');
    for (const field of ['xpGained', 'challengeJustDone', 'newAchievements', 'earnedToday']) {
      expect(docs).toContain(`"${field}"`);
    }
  });
});
