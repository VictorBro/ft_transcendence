import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Language, Level } from '@ft/shared';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { localDay } from '../src/lessons/roadmap.rules';
import { PrismaService } from '../src/prisma/prisma.service';
import { playLesson, playToLast, shortLesson } from './attempts.fixtures';

/**
 * Finishing a lesson, end to end, played through the attempt routes (#145):
 * the last page records the server's score under the course lock against a
 * real Postgres, and the goal change can meet the day too. No route takes
 * a score any more, so every score here is 100 (every unit right) or 0
 * (every unit blank).
 *
 * One learner per story, so a streak written by one never shows up in
 * another. The XP of a finish is checked in gamification.e2e-spec.ts, where
 * every spec knows the day's challenge: here it depends on the course id.
 * The clock is frozen at noon UTC, as in lessons.e2e-spec.ts.
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
  const lesson = (id: string, position: number, level: Level = 'A1', lang: Language = 'fr') =>
    shortLesson(`${lang}-test-fin-${id}`, position, level, lang);
  const FIXTURES = [
    ...['one', 'two', 'three', 'four', 'five', 'six'].map((id, index) => lesson(id, 9101 + index)),
    lesson('atwo', 9101, 'A2'),
    lesson('atwo-next', 9102, 'A2'),
    lesson('bone', 9101, 'B1'),
    lesson('alpha', 9101, 'A1', 'de'),
    // Has no files, so it cannot be played.
    { ...lesson('draft', 9200), ready: false },
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

  /** Plays a lesson to its results and gives back their finish block. */
  const finish = async (
    agent: TestAgent,
    id: string,
    how: 'right' | 'blank' = 'right',
    lang: Language = 'fr',
  ) => (await playLesson(agent, prisma, lang, id, how)).finish;

  const start = (agent: TestAgent, id: string, lang: Language = 'fr') =>
    agent.post(`/api/courses/${lang}/lessons/${id}/attempt`).send({ locale: 'en' });

  const course = (email: string, lang: Language = 'fr') =>
    prisma.userLevel.findFirstOrThrow({ where: { user: { email }, lang } });

  /**
   * Waits until `count` sessions wait behind the session `blocker`. Only
   * those: a lock taken by another run on the same database does not count.
   * Two sessions waiting for one row queue up: the second waits behind the
   * first, not behind `blocker`, so the query follows the queue.
   */
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

  /** The ids of a French level's ready lessons, by position: the real ones and the fixtures. */
  const levelIds = async (level: 'A2') => {
    const lessons = await prisma.lesson.findMany({
      where: { lang: 'fr', level, ready: true },
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
    // Its attempts go with the lessons (Cascade).
    await prisma.lessonResult.deleteMany({ where: { lessonId: { in: FIXTURE_IDS } } });
    await prisma.lesson.deleteMany({ where: { id: { in: FIXTURE_IDS } } });
    await prisma.lesson.createMany({ data: FIXTURES });
  });

  afterAll(async () => {
    // The users first: their courses, attempts and results cascade, then nothing blocks the lessons.
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.lesson.deleteMany({ where: { id: { in: FIXTURE_IDS } } });
    await app.close();
    vi.useRealTimers();
  });

  describe('who may play', () => {
    let agent: TestAgent;

    beforeAll(async () => {
      ({ agent } = await learner('errors', 30));
    });

    it('refuses an anonymous caller', async () => {
      await request(server())
        .post('/api/courses/fr/lessons/fr-test-fin-one/attempt')
        .send({ locale: 'en' })
        .expect(401);
    });

    it('answers 404 course.notFound without a course in that language', async () => {
      const response = await start(agent, 'de-test-fin-alpha', 'de').expect(404);

      expect(response.body.message).toBe('course.notFound');
    });

    it('answers 409 course.notPlaced before placement', async () => {
      const response = await start(agent, 'fr-test-fin-one').expect(409);

      expect(response.body.message).toBe('course.notPlaced');
    });

    describe('once placed', () => {
      beforeAll(async () => {
        await agent.patch('/api/courses/fr/level').send({ level: 'A1' }).expect(200);
      });

      it('answers 404 lesson.notFound for a lesson of another language', async () => {
        const response = await start(agent, 'de-test-fin-alpha').expect(404);

        expect(response.body.message).toBe('lesson.notFound');
      });

      it('answers 404 lesson.notFound for a lesson that is not ready, and saves nothing', async () => {
        const response = await start(agent, 'fr-test-fin-draft').expect(404);

        expect(response.body.message).toBe('lesson.notFound');
        const where = { lessonId: 'fr-test-fin-draft' };
        expect(await prisma.lessonAttempt.count({ where })).toBe(0);
        expect(await prisma.lessonResult.count({ where })).toBe(0);
      });

      it('has no route that takes a score', async () => {
        await agent
          .put('/api/courses/fr/lessons/fr-test-fin-one/result')
          .send({ score: 100 })
          .expect(404);
      });
    });
  });

  // The example of #82: goal 30 (3 lessons), then a better retake and a worse one.
  describe('a day at goal 30', () => {
    let agent: TestAgent;
    let email: string;

    beforeAll(async () => {
      ({ agent, email } = await learner('day', 30, 'A1'));
    });

    it('counts a first finish for today', async () => {
      expect(await finish(agent, 'fr-test-fin-one', 'blank')).toMatchObject({
        countedToday: true,
        doneCount: 1,
        target: 3,
        goalJustMet: false,
        best: 0,
      });
    });

    it('raises the best score with a retake on the same day, one row, counted once', async () => {
      const result = await finish(agent, 'fr-test-fin-one');
      const rows = await prisma.lessonResult.findMany({
        where: { userLevelId: (await course(email)).id },
      });

      expect(result).toMatchObject({ countedToday: false, doneCount: 1, best: 100 });
      expect(rows).toHaveLength(1);
      expect(rows[0].score).toBe(100);
    });

    it('meets the goal on the third lesson, and starts the streak', async () => {
      await finish(agent, 'fr-test-fin-two');
      const result = await finish(agent, 'fr-test-fin-three');
      const row = await course(email);

      expect(result).toMatchObject({
        countedToday: true,
        doneCount: 3,
        target: 3,
        goalJustMet: true,
        best: 100,
      });
      expect(row).toMatchObject({ streak: 1, bestStreak: 1, lastGoalDay: new Date(today) });
    });

    it('never lowers the score, and never meets the day twice', async () => {
      const result = await finish(agent, 'fr-test-fin-three', 'blank');
      const row = await course(email);
      const saved = await prisma.lessonResult.findFirstOrThrow({
        where: { userLevelId: row.id, lessonId: 'fr-test-fin-three' },
      });

      expect(result).toMatchObject({
        countedToday: false,
        doneCount: 3,
        target: 3,
        goalJustMet: false,
        best: 100,
      });
      expect(saved.score).toBe(100);
      expect(row.streak).toBe(1);
    });

    // German met today too, while French was already met: two streaks.
    it('keeps a separate streak on a second course', async () => {
      await agent.post('/api/courses').send({ lang: 'de', dailyGoal: 10 }).expect(201);
      await agent.patch('/api/courses/de/level').send({ level: 'A1' }).expect(200);

      const result = await finish(agent, 'de-test-fin-alpha', 'right', 'de');

      expect(result).toMatchObject({ doneCount: 1, target: 1, goalJustMet: true });
      expect(await course(email, 'de')).toMatchObject({ streak: 1, lastGoalDay: new Date(today) });
      expect(await course(email, 'fr')).toMatchObject({ streak: 1, lastGoalDay: new Date(today) });
    });
  });

  /**
   * Goal 60 is 6 lessons: the last pages of the 5th and 6th sent at once
   * must meet the day once.
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
      await finish(agent, `fr-test-fin-${id}`);
    }
    const lastOfFive = await playToLast(agent, prisma, 'fr', 'fr-test-fin-five');
    const lastOfSix = await playToLast(agent, prisma, 'fr', 'fr-test-fin-six');
    const { id } = await course(email);

    let sent!: Promise<Awaited<ReturnType<typeof lastOfFive>>[]>;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "UserLevel" WHERE id = ${id}::uuid FOR UPDATE`;
      const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      // Promise.all calls then() on each request, which is what sends it.
      sent = Promise.all([lastOfFive().expect(200), lastOfSix().expect(200)]);
      await waitForBlocked(pid, 2);
      // The transaction commits when this callback returns: that frees the row.
    });
    const both = (await sent).map((response) => response.body.attempt.results.finish);

    expect(both.map((result) => result.goalJustMet).sort()).toEqual([false, true]);
    expect(both.map((result) => result.doneCount).sort()).toEqual([5, 6]);
    expect(await course(email)).toMatchObject({ streak: 1, lastGoalDay: new Date(today) });
  });

  it('meets the day when the goal drops under what is done, and keeps it when it rises', async () => {
    const { agent, email } = await learner('goal', 60, 'A1');
    for (const id of ['one', 'two', 'three']) {
      await finish(agent, `fr-test-fin-${id}`);
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

    await finish(agent, first);
    await agent.patch('/api/courses/fr/level').send({ level: 'B1' }).expect(200);
    await finish(agent, 'fr-test-fin-bone');
    await agent.patch('/api/courses/fr/level').send({ level: 'A2' }).expect(200);

    const lesson = await agent.get(`/api/courses/fr/lessons/${first}`).expect(200);
    const plan = await agent.get('/api/courses/fr/today').expect(200);

    expect(lesson.body).toMatchObject({ status: 'done', score: 100 });
    // A target of 3 with 2 done today: one proposed, the A2 lesson after `first`.
    expect(plan.body.proposed.map((card: { id: string }) => card.id)).toEqual([next]);
  });

  it('documents the attempt routes in Swagger, and no result route', async () => {
    const response = await request(server()).get('/api/docs-json').expect(200);
    const paths = response.body.paths;

    expect(Object.keys(paths['/api/courses/{lang}/lessons/{id}/attempt'])).toEqual(
      expect.arrayContaining(['get', 'post']),
    );
    expect(paths['/api/courses/{lang}/lessons/{id}/attempt/pages/{index}']).toHaveProperty('post');
    expect(paths['/api/courses/{lang}/lessons/{id}/result']).toBeUndefined();
  });
});
