import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';

import type { Language, Level } from '@ft/shared';

import { AppModule } from '../src/app.module';
import type { Prisma } from '../src/generated/prisma/client';
import { configureApp } from '../src/app.setup';
import { localDay } from '../src/lessons/roadmap.rules';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Finishing a lesson, end to end: the stub guard, the score check, the
 * transaction under the course lock against a real Postgres, and the goal
 * change that can meet the day too.
 *
 * One learner per story, so a streak written by one never shows up in
 * another. The clock is frozen at noon UTC, as in lessons.e2e-spec.ts.
 */
describe('finish a lesson (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const stamp = Date.now();
  const emails: string[] = [];

  const today = localDay(new Date(), 'UTC');
  const NOON = new Date(`${today}T12:00:00.000Z`);

  // Letters only in the ids: LESSON_ID_PATTERN refuses digits. High
  // positions, so they come after the real lessons of their level.
  const lesson = (
    id: string,
    position: number,
    level: Level = 'A1',
    lang: Language = 'fr',
  ): Prisma.LessonCreateManyInput => ({
    id: `${lang}-test-fin-${id}`,
    lang,
    level,
    position,
    kind: 'grammar',
    topic: 'pronouns',
    theme: null,
    title: 'Une leçon du testeur',
    summary: 'Une leçon de test.',
    brief: { objective: 'test', points: [], examples: [], pitfalls: [], vocabulary: [] },
  });
  const FIXTURES = [
    ...['one', 'two', 'three', 'four', 'five', 'six'].map((id, index) => lesson(id, 9101 + index)),
    lesson('atwo', 9101, 'A2'),
    lesson('atwo-next', 9102, 'A2'),
    lesson('bone', 9101, 'B1'),
    lesson('alpha', 9101, 'A1', 'de'),
  ];
  const FIXTURE_IDS = FIXTURES.map((fixture) => fixture.id);

  const server = () => app.getHttpServer();

  /** A fresh learner with a French course at that goal, placed at `level` if given. */
  const learner = async (name: string, dailyGoal: 10 | 30 | 60, level?: string) => {
    const email = `finish-${name}-${stamp}@example.com`;
    emails.push(email);
    const agent = request.agent(server());
    await agent
      .post('/api/auth/signup')
      .send({ email, displayName: `fin${name}${stamp}`, password: 'Correct-Horse-9' })
      .expect(201);
    await agent.post('/api/courses').send({ lang: 'fr', dailyGoal }).expect(201);
    if (level) {
      await agent.patch('/api/courses/fr/level').send({ level }).expect(200);
    }
    return { agent, email };
  };

  const finish = (agent: TestAgent, id: string, score = 80, lang = 'fr') =>
    agent.put(`/api/courses/${lang}/lessons/${id}/result`).send({ score });

  const course = (email: string, lang: Language = 'fr') =>
    prisma.userLevel.findFirstOrThrow({ where: { user: { email }, lang } });

  /** Waits until `count` queries of this database are blocked on a row lock. */
  const waitForLockWaiters = (count: number) =>
    vi.waitFor(
      async () => {
        const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
          SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`;
        expect(waiting).toBe(count);
      },
      { timeout: 4_000, interval: 20 },
    );

  /** The ids of a French level, by position: the real lessons and the fixtures. */
  const levelIds = async (level: 'A2') => {
    const lessons = await prisma.lesson.findMany({
      where: { lang: 'fr', level },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    return lessons.map((lesson) => lesson.id);
  };

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
    // The users first: their courses and results cascade, then nothing blocks the lessons.
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.lesson.deleteMany({ where: { id: { in: FIXTURE_IDS } } });
    await app.close();
    vi.useRealTimers();
  });

  describe('who may finish', () => {
    let agent: TestAgent;

    beforeAll(async () => {
      ({ agent } = await learner('errors', 30));
    });

    it('refuses an anonymous caller', async () => {
      await request(server())
        .put('/api/courses/fr/lessons/fr-test-fin-one/result')
        .send({ score: 80 })
        .expect(401);
    });

    it('answers 404 course.notFound without a course in that language', async () => {
      const response = await finish(agent, 'de-test-fin-alpha', 80, 'de').expect(404);

      expect(response.body.message).toBe('course.notFound');
    });

    it('answers 409 course.notPlaced before placement', async () => {
      const response = await finish(agent, 'fr-test-fin-one').expect(409);

      expect(response.body.message).toBe('course.notPlaced');
    });

    describe('once placed', () => {
      beforeAll(async () => {
        await agent.patch('/api/courses/fr/level').send({ level: 'A1' }).expect(200);
      });

      it('answers 404 lesson.notFound for a lesson of another language', async () => {
        const response = await finish(agent, 'de-test-fin-alpha').expect(404);

        expect(response.body.message).toBe('lesson.notFound');
      });

      it.each([101, -1, 70.5])('answers 400 lesson.invalidScore for %s', async (score) => {
        const response = await finish(agent, 'fr-test-fin-one', score).expect(400);

        expect(response.body.message).toEqual(['lesson.invalidScore']);
      });

      it('answers 404 lesson.notFound while LESSON_STUB is unset', async () => {
        const stub = process.env.LESSON_STUB;
        delete process.env.LESSON_STUB;
        onTestFinished(() => {
          process.env.LESSON_STUB = stub;
        });

        const response = await finish(agent, 'fr-test-fin-one').expect(404);

        expect(response.body.message).toBe('lesson.notFound');
      });
    });
  });

  // The example of the issue: goal 30 (3 lessons), then a worse redo.
  describe('a day at goal 30', () => {
    let agent: TestAgent;
    let email: string;

    beforeAll(async () => {
      ({ agent, email } = await learner('day', 30, 'A1'));
    });

    it('counts a first finish for today', async () => {
      const response = await finish(agent, 'fr-test-fin-one', 62).expect(200);

      expect(response.body).toEqual({
        countedToday: true,
        doneCount: 1,
        target: 3,
        goalJustMet: false,
      });
    });

    it('keeps one row and the best score for a lesson finished twice, counted once', async () => {
      const response = await finish(agent, 'fr-test-fin-one', 80).expect(200);
      const rows = await prisma.lessonResult.findMany({
        where: { userLevelId: (await course(email)).id },
      });

      expect(response.body).toMatchObject({ countedToday: false, doneCount: 1 });
      expect(rows).toHaveLength(1);
      expect(rows[0].score).toBe(80);
    });

    it('meets the goal on the third lesson, and starts the streak', async () => {
      await finish(agent, 'fr-test-fin-two').expect(200);
      const response = await finish(agent, 'fr-test-fin-three').expect(200);
      const row = await course(email);

      expect(response.body).toEqual({
        countedToday: true,
        doneCount: 3,
        target: 3,
        goalJustMet: true,
      });
      expect(row).toMatchObject({ streak: 1, bestStreak: 1, lastGoalDay: new Date(today) });
    });

    it('never lowers the score, and never meets the day twice', async () => {
      const response = await finish(agent, 'fr-test-fin-three', 10).expect(200);
      const row = await course(email);
      const result = await prisma.lessonResult.findFirstOrThrow({
        where: { userLevelId: row.id, lessonId: 'fr-test-fin-three' },
      });

      expect(response.body).toEqual({
        countedToday: false,
        doneCount: 3,
        target: 3,
        goalJustMet: false,
      });
      expect(result.score).toBe(80);
      expect(row.streak).toBe(1);
    });

    // German met today too, while French was already met: two streaks.
    it('keeps a separate streak on a second course', async () => {
      await agent.post('/api/courses').send({ lang: 'de', dailyGoal: 10 }).expect(201);
      await agent.patch('/api/courses/de/level').send({ level: 'A1' }).expect(200);

      const response = await finish(agent, 'de-test-fin-alpha', 80, 'de').expect(200);

      expect(response.body).toMatchObject({ doneCount: 1, target: 1, goalJustMet: true });
      expect(await course(email, 'de')).toMatchObject({ streak: 1, lastGoalDay: new Date(today) });
      expect(await course(email, 'fr')).toMatchObject({ streak: 1, lastGoalDay: new Date(today) });
    });
  });

  /**
   * Goal 60 is 6 lessons: the 5th and 6th sent at once must meet the day once.
   *
   * Two requests sent together still reach Postgres a few milliseconds apart,
   * so on their own they would rarely overlap. The test holds the course row
   * itself until both are waiting on it, then lets them go at the same
   * instant. With lockCourse, they then run one after the other. Without it,
   * both count 5 and nobody meets the day.
   */
  it('meets the day once when two finishes arrive at the same time', async () => {
    const { agent, email } = await learner('race', 60, 'A1');
    for (const id of ['one', 'two', 'three', 'four']) {
      await finish(agent, `fr-test-fin-${id}`).expect(200);
    }
    const { id } = await course(email);

    let sent!: Promise<Awaited<ReturnType<typeof finish>>[]>;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "UserLevel" WHERE id = ${id}::uuid FOR UPDATE`;
      // Promise.all calls then() on each request, which is what sends it.
      sent = Promise.all([
        finish(agent, 'fr-test-fin-five').expect(200),
        finish(agent, 'fr-test-fin-six').expect(200),
      ]);
      await waitForLockWaiters(2);
      // The transaction commits when this callback returns: that frees the row.
    });
    const both = await sent;

    expect(both.map((response) => response.body.goalJustMet).sort()).toEqual([false, true]);
    expect(both.map((response) => response.body.doneCount).sort()).toEqual([5, 6]);
    expect(await course(email)).toMatchObject({ streak: 1, lastGoalDay: new Date(today) });
  });

  it('meets the day when the goal drops under what is done, and keeps it when it rises', async () => {
    const { agent, email } = await learner('goal', 60, 'A1');
    for (const id of ['one', 'two', 'three']) {
      await finish(agent, `fr-test-fin-${id}`).expect(200);
    }
    expect(await course(email)).toMatchObject({ streak: 0, lastGoalDay: null });

    await agent.patch('/api/courses/fr').send({ dailyGoal: 30 }).expect(200);
    expect(await course(email)).toMatchObject({ streak: 1, lastGoalDay: new Date(today) });

    await agent.patch('/api/courses/fr').send({ dailyGoal: 60 }).expect(200);
    expect(await course(email)).toMatchObject({ streak: 1, lastGoalDay: new Date(today) });
  });

  it('keeps the progress of a level across a level switch', async () => {
    const { agent } = await learner('switch', 30, 'A2');
    const [first, next] = await levelIds('A2');

    await finish(agent, first).expect(200);
    await agent.patch('/api/courses/fr/level').send({ level: 'B1' }).expect(200);
    await finish(agent, 'fr-test-fin-bone').expect(200);
    await agent.patch('/api/courses/fr/level').send({ level: 'A2' }).expect(200);

    const lesson = await agent.get(`/api/courses/fr/lessons/${first}`).expect(200);
    const plan = await agent.get('/api/courses/fr/today').expect(200);

    expect(lesson.body).toMatchObject({ status: 'done', score: 80 });
    // A target of 3 with 2 done today: one proposed, the A2 lesson after `first`.
    expect(plan.body.proposed.map((card: { id: string }) => card.id)).toEqual([next]);
  });

  it('documents the route in Swagger', async () => {
    const response = await request(server()).get('/api/docs-json').expect(200);

    expect(response.body.paths['/api/courses/{lang}/lessons/{id}/result']).toHaveProperty('put');
  });
});
