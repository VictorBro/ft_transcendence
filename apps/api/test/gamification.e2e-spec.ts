import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ACHIEVEMENTS,
  type ChallengeCode,
  CHALLENGE_XP,
  GOAL_XP,
  LESSON_XP,
  type LessonKind,
  type Theme,
} from '@ft/shared';

import { AppModule } from '../src/app.module';
import type { Prisma } from '../src/generated/prisma/client';
import { configureApp } from '../src/app.setup';
import { readyKinds } from '../src/lessons/gamification';
import { challengeFor, rankOf } from '../src/lessons/gamification.rules';
import { localDay, previousDay } from '../src/lessons/roadmap.rules';
import { PrismaService } from '../src/prisma/prisma.service';
import { openAttempt, shortLesson } from './attempts.fixtures';

/**
 * XP, the daily challenge and the achievements (#95), end to end. Every
 * lesson is finished by playing an attempt (#145): the server computes the
 * score from the answers, and award runs where the attempt closes.
 *
 * The challenge is a hash of the course id and the day, among the challenges
 * French A1 can do, so it changes with every learner. Each story reads its
 * course's challenge first, then picks lessons and answers that miss it,
 * except where a story meets it on purpose. That way every XP number is
 * exact: LESSON_XP 10 + the points a finish adds to the best, GOAL_XP 20
 * when it meets the day, CHALLENGE_XP 30 when it does the challenge.
 *
 * Every fixture plays PR #142's short lesson (attempts.fixtures.ts) under a
 * fr-test-gam- id, as grammar, vocabulary or functions. None is reading:
 * French A1 has no ready reading lesson, so its learners never get the
 * reading challenge. The clock is frozen at noon UTC.
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
  const KINDS = ['grammar', 'vocabulary', 'functions'] as const satisfies readonly LessonKind[];
  const THEMES: Record<Exclude<(typeof KINDS)[number], 'grammar'>, Theme> = {
    vocabulary: 'food_and_drink',
    functions: 'relations',
  };

  /** Ten French A1 lessons of each kind but reading, after the real ones of the level. */
  const FIXTURES: Prisma.LessonCreateManyInput[] = KINDS.flatMap((kind, k) =>
    LETTERS.map((letter, index) => ({
      ...shortLesson(`fr-test-gam-${kind}-${letter}`, 9301 + k * LETTERS.length + index),
      kind,
      topic: kind === 'grammar' ? ('pronouns' as const) : null,
      theme: kind === 'grammar' ? null : THEMES[kind],
    })),
  );
  const FIXTURE_IDS = FIXTURES.map((fixture) => fixture.id);

  /**
   * How a learner answers, and the score the server gives it. The short
   * lesson weighs practice 35 and its exam (one page, 4 units) 65.
   */
  type How = 'right' | 'oneExamWrong' | 'practiceOnly' | 'blank';
  const SCORE: Record<How, number> = {
    right: 100,
    oneExamWrong: 84, // 35 + 65 × 3/4 = 83.75, kept whole
    practiceOnly: 35,
    blank: 0,
  };

  const server = () => app.getHttpServer();

  /**
   * A fresh learner, placed in French A1 at that goal, and their course's
   * challenge today, from the same ready kinds award reads. Each claims its
   * own TEST-NET-3 address: the sign-up throttler counts per IP.
   */
  let addresses = 0;
  const learner = async (name: string, dailyGoal: 10 | 30 | 60) => {
    const email = `gamification-${name}-${stamp}@example.com`;
    emails.push(email);
    addresses += 1;
    const agent = request.agent(server()).set('X-Forwarded-For', `203.0.113.${addresses}`);
    await agent
      .post('/api/auth/signup')
      .send({ email, displayName: `gam${name}${stamp}`, password: 'Correct-Horse-9' })
      .expect(201);
    await agent.post('/api/courses').send({ lang: 'fr', dailyGoal }).expect(201);
    await agent.patch('/api/courses/fr/level').send({ level: 'A1' }).expect(200);

    const course = await prisma.userLevel.findFirstOrThrow({
      where: { user: { email }, lang: 'fr' },
    });
    const kinds = await readyKinds(prisma, course);
    return { agent, email, courseId: course.id, challenge: challengeFor(course.id, today, kinds) };
  };

  /**
   * Hands out fixture lessons and answers, never the same lesson twice per
   * learner. `miss` gives a kind the challenge does not ask for, answered
   * under 90 when the challenge is score90; `meet` gives the kind it asks
   * for, every answer right (100 does score90). beyondGoal depends on the
   * count, which the story chooses.
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
        throw new Error(`no fixture lesson left of ${kinds.join(', ')}`);
      }
      used.add(id);
      return id;
    };
    const isKind = (KINDS as readonly string[]).includes(challenge);
    return {
      missHow: (challenge === 'score90' ? 'oneExamWrong' : 'right') as How,
      miss: () => take(KINDS.filter((kind) => kind !== challenge)),
      meet: () => take(isKind ? [challenge as LessonKind] : KINDS),
    };
  };

  /**
   * Plays a lesson up to its last page, answered `how`. Returns the request
   * of the last page, unsent, so a test can send two at once.
   */
  const playToLast = async (agent: TestAgent, id: string, how: How) => {
    const { plan, answers, send } = await openAttempt(agent, prisma, 'fr', id);
    const page = (index: number) => {
      const { role, units } = plan.pages[index];
      if (how === 'right' || (role !== 'exam' && how !== 'blank')) return answers(index);
      if (how === 'oneExamWrong')
        return answers(index, (unit) => (unit === units[0] ? 'blank' : 'right'));
      return answers(index, () => 'blank');
    };
    const last = plan.pages.length - 1;
    for (let index = 0; index < last; index += 1) {
      await send(index, page(index)).expect(200);
    }
    return () => send(last, page(last));
  };

  /** What the finish of a whole lesson returned: countedToday, xpGained, newAchievements… */
  const finish = async (agent: TestAgent, id: string, how: How) => {
    const last = await playToLast(agent, id, how);
    const response = await last().expect(200);
    return response.body.attempt.results.finish as Record<string, unknown> & {
      xpGained: number;
      best: number;
    };
  };

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
    // The users first: their courses, attempts, results and achievements cascade.
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.lesson.deleteMany({ where: { id: { in: FIXTURE_IDS } } });
    await app.close();
    vi.useRealTimers();
  });

  it('scores each way of answering as the stories below count on', async () => {
    const { agent } = await learner('scores', 60);
    const pick = lessonsFor('reading'); // no fixture is reading: any kind

    for (const how of ['right', 'oneExamWrong', 'practiceOnly', 'blank'] as const) {
      expect((await finish(agent, pick.miss(), how)).best, how).toBe(SCORE[how]);
    }
  });

  it('never gives a French A1 course the reading challenge: the level has no ready reading lesson', async () => {
    expect(await readyKinds(prisma, { lang: 'fr', level: 'A1' })).not.toContain('reading');
    const { agent, challenge } = await learner('noreading', 10);

    const response = await agent.get('/api/courses/fr/today').expect(200);

    expect(challenge).not.toBe('reading');
    expect(response.body.challenge).toEqual({ code: challenge, done: false });
  });

  /**
   * Goal 10 (one lesson), so the first finish meets the day and the next two
   * are both beyond it: whatever the challenge, both of them do it. Both
   * last pages are sent while the course row is held, then let go at once.
   */
  it('awards the challenge once when two last pages that both do it arrive together', async () => {
    const { agent, courseId, challenge } = await learner('race', 10);
    const pick = lessonsFor(challenge);
    const first = await finish(agent, pick.miss(), pick.missHow);
    const firstXp = LESSON_XP + SCORE[pick.missHow] + GOAL_XP;
    expect(first).toMatchObject({ xpGained: firstXp, challengeJustDone: false });

    const lasts = [
      await playToLast(agent, pick.meet(), 'right'),
      await playToLast(agent, pick.meet(), 'right'),
    ];
    let sent!: Promise<request.Response[]>;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "UserLevel" WHERE id = ${courseId}::uuid FOR UPDATE`;
      const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      sent = Promise.all(lasts.map((last) => last().expect(200)));
      await waitForBlocked(pid, 2);
    });
    const both = (await sent).map((response) => response.body.attempt.results.finish);
    const lesson = LESSON_XP + SCORE.right;

    expect(both.map((result) => result.challengeJustDone).sort()).toEqual([false, true]);
    expect(both.map((result) => result.xpGained).sort((a, b) => a - b)).toEqual([
      lesson,
      lesson + CHALLENGE_XP,
    ]);
    expect(await course(courseId)).toMatchObject({
      xp: firstXp + 2 * lesson + CHALLENGE_XP,
      challengesDone: 1,
      lastChallengeDay: new Date(today),
    });
  });

  it('adds GOAL_XP to the finish that meets a goal of 30, and only to that one', async () => {
    const { agent, challenge } = await learner('goal', 30);
    const pick = lessonsFor(challenge);
    const lesson = LESSON_XP + SCORE[pick.missHow];

    const gains = [];
    for (let index = 0; index < 3; index += 1) {
      gains.push((await finish(agent, pick.miss(), pick.missHow)).xpGained);
    }

    expect(gains).toEqual([lesson, lesson, lesson + GOAL_XP]);
  });

  it('adds GOAL_XP once when the goal drops from 60 to 30 after three finishes', async () => {
    const { agent, courseId, challenge } = await learner('lower', 60);
    const pick = lessonsFor(challenge);
    for (let index = 0; index < 3; index += 1) {
      await finish(agent, pick.miss(), pick.missHow);
    }
    const three = 3 * (LESSON_XP + SCORE[pick.missHow]);
    expect((await course(courseId)).xp).toBe(three);

    await agent.patch('/api/courses/fr').send({ dailyGoal: 30 }).expect(200);
    expect((await course(courseId)).xp).toBe(three + GOAL_XP);

    await agent.patch('/api/courses/fr').send({ dailyGoal: 60 }).expect(200);
    await agent.patch('/api/courses/fr').send({ dailyGoal: 30 }).expect(200);
    expect((await course(courseId)).xp).toBe(three + GOAL_XP);
  });

  it('stores streak7 when a lower goal turns a streak of 6 into 7', async () => {
    const { agent, courseId, challenge } = await learner('lowerstreak', 60);
    const pick = lessonsFor(challenge);
    for (let index = 0; index < 3; index += 1) {
      await finish(agent, pick.miss(), pick.missHow);
    }
    await streakOfSix(courseId);

    await agent.patch('/api/courses/fr').send({ dailyGoal: 30 }).expect(200);

    const stored = await prisma.userAchievement.findUnique({
      where: { userLevelId_code: { userLevelId: courseId, code: 'streak7' } },
    });
    expect(stored).toMatchObject({ day: new Date(today) });
  });

  // Both retakes stay under 90 and count once for the day (goal 30, one
  // lesson): neither does score90 nor beyondGoal, whatever the challenge.
  it('gains nothing for a lower retake on the same day, and never loses XP', async () => {
    const { agent, courseId, challenge } = await learner('lowerretake', 30);
    const id = lessonsFor(challenge).miss();
    await finish(agent, id, 'oneExamWrong');

    const retake = await finish(agent, id, 'blank');

    expect(retake).toMatchObject({
      countedToday: false,
      xpGained: 0,
      best: SCORE.oneExamWrong,
      newAchievements: [],
    });
    expect((await course(courseId)).xp).toBe(LESSON_XP + SCORE.oneExamWrong);
  });

  it('gains only the points a higher retake adds to the best, on the same day', async () => {
    const { agent, courseId, challenge } = await learner('higherretake', 30);
    const id = lessonsFor(challenge).miss();
    const first = await finish(agent, id, 'practiceOnly');

    const retake = await finish(agent, id, 'oneExamWrong');

    expect(first.xpGained).toBe(LESSON_XP + SCORE.practiceOnly);
    expect(retake).toMatchObject({
      countedToday: false,
      xpGained: SCORE.oneExamWrong - SCORE.practiceOnly,
      best: SCORE.oneExamWrong,
    });
    expect((await course(courseId)).xp).toBe(LESSON_XP + SCORE.oneExamWrong);
  });

  it('returns streak7 from the finish that turns a streak of 6 into 7, and only once', async () => {
    const { agent, courseId, challenge } = await learner('streak', 10);
    const pick = lessonsFor(challenge);
    const id = pick.miss();
    await streakOfSix(courseId);

    const first = await finish(agent, id, pick.missHow);
    // The same lesson again: the count stays at 1, so beyondGoal stays out of reach too.
    const second = await finish(agent, id, pick.missHow);

    expect(first.newAchievements).toEqual(['firstLesson', 'streak3', 'streak7']);
    expect(second.newAchievements).toEqual([]);
    const rows = await prisma.userAchievement.findMany({ where: { userLevelId: courseId } });
    expect(rows.map((row) => row.code).sort()).toEqual(['firstLesson', 'streak3', 'streak7']);
  });

  /**
   * Every French A1 lesson the database holds, seeded or fixture, gets a
   * result written straight to the table, but two. The finish of the first
   * leaves one lesson without a result, so no levelA1 yet; the finish of the
   * second completes the level.
   */
  it('returns levelA1 from the finish that completes French A1, and not before', async () => {
    const { agent, courseId, challenge } = await learner('level', 10);
    const pick = lessonsFor(challenge);
    const [before, last] = [pick.miss(), pick.miss()];
    const level = await prisma.lesson.findMany({
      where: { lang: 'fr', level: 'A1', id: { notIn: [before, last] } },
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

    const almost = await finish(agent, before, pick.missHow);
    const complete = await finish(agent, last, pick.missHow);

    expect(almost.newAchievements).not.toContain('levelA1');
    expect(complete.newAchievements).toContain('levelA1');
    await prisma.lessonResult.deleteMany({ where: { userLevelId: courseId } });
  });

  it('shows the exact XP and rank, the challenge done, and what was earned today', async () => {
    const { agent, challenge } = await learner('today', 30);
    const pick = lessonsFor(challenge);
    // Goal 30 is 3 lessons. One that misses, then the one that does it; for
    // beyondGoal, three that miss first, so the fourth is beyond the goal.
    const misses = challenge === 'beyondGoal' ? 3 : 1;
    for (let index = 0; index < misses; index += 1) {
      await finish(agent, pick.miss(), pick.missHow);
    }
    const done = await finish(agent, pick.meet(), 'right');
    expect(done.challengeJustDone).toBe(true);
    const total =
      misses * (LESSON_XP + SCORE[pick.missHow]) +
      (misses === 3 ? GOAL_XP : 0) +
      LESSON_XP +
      SCORE.right +
      CHALLENGE_XP;

    const response = await agent.get('/api/courses/fr/today').expect(200);

    expect(response.body.challenge).toEqual({ code: challenge, done: true });
    expect(response.body.earnedToday).toEqual(['firstLesson']);
    expect(response.body.xp).toEqual({ total, ...rankOf(total) });
  });

  it('lists the sixteen achievements, the earned ones with their day', async () => {
    const { agent, challenge } = await learner('list', 30);
    const pick = lessonsFor(challenge);
    await finish(agent, pick.miss(), pick.missHow);

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
    expect(items.find((item) => item.code === 'passed10')).toMatchObject({
      day: null,
      current: 1,
      target: 10,
    });
    expect(items.find((item) => item.code === 'levelA1')).toMatchObject({
      day: null,
      level: { attempted: 1, passed: 1 },
    });
  });

  it('answers the achievements route like the reads: 404, then 409 before placement', async () => {
    const email = `gamification-lookup-${stamp}@example.com`;
    emails.push(email);
    addresses += 1;
    const agent = request.agent(server()).set('X-Forwarded-For', `203.0.113.${addresses}`);
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
    const pick = lessonsFor(challenge);
    await finish(agent, pick.miss(), pick.missHow);
    expect(
      await prisma.userAchievement.count({ where: { userLevelId: courseId } }),
    ).toBeGreaterThan(0);

    await prisma.user.delete({ where: { email } });

    expect(await prisma.userAchievement.count({ where: { userLevelId: courseId } })).toBe(0);
  });

  it('documents the route and the new fields in Swagger', async () => {
    const response = await request(server()).get('/api/docs-json').expect(200);
    const { paths, components } = response.body;
    const properties = (name: string) => Object.keys(components.schemas[name]?.properties ?? {});

    expect(paths['/api/courses/{lang}/achievements']).toHaveProperty('get');
    expect(properties('AchievementListDto')).toEqual(['items']);
    expect(properties('TodayDto')).toEqual(
      expect.arrayContaining(['xp', 'challenge', 'earnedToday']),
    );
    expect(properties('PageResultDto').length).toBeGreaterThan(0);
    expect(JSON.stringify(components.schemas)).toMatch(
      /"xpGained".*"challengeJustDone".*"newAchievements"/s,
    );
  });
});
