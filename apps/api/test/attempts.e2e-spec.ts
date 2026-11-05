import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Language, Level } from '@ft/shared';

import { findContentDir, seedLessons } from '../prisma/seed';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { lessonAttempts } from '../src/metrics/metrics';
import { localDay } from '../src/lessons/roadmap.rules';
import { PrismaService } from '../src/prisma/prisma.service';
import { openAttempt, playLesson, playToLast, shortLesson } from './attempts.fixtures';
import { seriesValue } from './metrics.fixtures';

/**
 * The lesson attempt, end to end (#145): the server sends only the page at
 * the cursor, checks every answer, owns the exam timer, and records the
 * result from the answers it stored.
 *
 * Every lesson here is PR #142's short vocabulary lesson under a test id:
 * two presentation pages, six practice pages, the discussion, the exam info
 * page and one exam page of 4 units with an 80 s countdown, last. The clock
 * is frozen at noon UTC and only jumps forward, so every story stays on one
 * day. One learner per story.
 */
describe('lesson attempts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let contentDir: string | undefined;

  const stamp = Date.now();
  const emails: string[] = [];

  const today = localDay(new Date(), 'UTC');
  const NOON = new Date(`${today}T12:00:00.000Z`);

  const lesson = (id: string, position: number, level: Level = 'A1', lang: Language = 'fr') =>
    shortLesson(`${lang}-test-att-${id}`, position, level, lang);
  const FIXTURES = [
    lesson('one', 9101),
    lesson('alpha', 9101, 'A1', 'de'),
    { ...lesson('draft', 9200), ready: false },
  ];
  const FIXTURE_IDS = FIXTURES.map((fixture) => fixture.id);
  const ONE = 'fr-test-att-one';
  const RESEEDED = 'fr-test-att-reseed';
  const TEST_LESSONS = { OR: [{ id: { in: FIXTURE_IDS } }, { id: RESEEDED }] };

  const server = () => app.getHttpServer();

  /**
   * A fresh learner with a French course at goal 10 (one lesson), placed at
   * A1 unless `placed` is false. The sign-up throttler counts per IP, and
   * this suite signs up more learners than one address may: each claims its
   * own TEST-NET-1 address, as in two-factor.e2e-spec.ts.
   */
  let addresses = 0;
  const learner = async (name: string, { placed = true } = {}) => {
    const email = `attempt-${name}-${stamp}@example.com`;
    emails.push(email);
    addresses += 1;
    const agent = request.agent(server()).set('X-Forwarded-For', `192.0.2.${addresses}`);
    await agent
      .post('/api/auth/signup')
      .send({ email, displayName: `att${name}${stamp}`, password: 'Correct-Horse-9' })
      .expect(201);
    await agent.post('/api/courses').send({ lang: 'fr', dailyGoal: 10 }).expect(201);
    if (placed) {
      await agent.patch('/api/courses/fr/level').send({ level: 'A1' }).expect(200);
    }
    return { agent, email };
  };

  const course = (email: string) =>
    prisma.userLevel.findFirstOrThrow({ where: { user: { email }, lang: 'fr' } });
  const attemptRow = (id: string) => prisma.lessonAttempt.findUniqueOrThrow({ where: { id } });

  /** The keys a learner must not see before the results, wherever they hide. */
  const KEYS = ['outcome', 'points', 'answer', 'accepted', 'correct', 'explanation'];
  const leaks = (value: unknown, path = ''): string[] =>
    value !== null && typeof value === 'object'
      ? Object.entries(value).flatMap(([key, inner]) => [
          ...(KEYS.includes(key) ? [`${path}${key}`] : []),
          ...leaks(inner, `${path}${key}.`),
        ])
      : [];

  /** The index of the first page with that role in the short lesson. */
  const pageOf = (plan: { pages: { role: string }[] }, role: string) =>
    plan.pages.findIndex((page) => page.role === role);

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    vi.setSystemTime(NOON);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    // What an interrupted run may have left: its results first, Restrict blocks the lessons.
    await prisma.lessonResult.deleteMany({ where: { lesson: TEST_LESSONS } });
    await prisma.lesson.deleteMany({ where: TEST_LESSONS });
    await prisma.lesson.createMany({ data: FIXTURES });
  });

  afterAll(async () => {
    // The users first: their courses, attempts and results cascade, then nothing blocks the lessons.
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.lesson.deleteMany({ where: TEST_LESSONS });
    if (contentDir !== undefined) {
      await rm(dirname(contentDir), { recursive: true, force: true });
    }
    await app.close();
    vi.useRealTimers();
  });

  describe('start', () => {
    it('answers 409 course.notPlaced before placement', async () => {
      const { agent } = await learner('unplaced', { placed: false });

      const response = await agent
        .post(`/api/courses/fr/lessons/${ONE}/attempt`)
        .send({ locale: 'en' })
        .expect(409);

      expect(response.body.message).toBe('course.notPlaced');
    });

    it('answers 201 with a new attempt, then 200 with the same one', async () => {
      const { agent } = await learner('start');
      const url = `/api/courses/fr/lessons/${ONE}/attempt`;

      const before = await agent.get(url).expect(200);
      const first = await agent.post(url).send({ locale: 'en' }).expect(201);
      const again = await agent.post(url).send({ locale: 'fr' }).expect(200);
      const read = await agent.get(url).expect(200);

      expect(before.body.attempt).toBeNull();
      expect(before.body.outline.lessonId).toBe(ONE);
      expect(again.body).toEqual(first.body);
      expect(read.body.attempt).toEqual(first.body);
      expect(first.body.current.index).toBe(0);
    });

    it('makes one attempt of two parallel starts, a first one and a retake', async () => {
      const url = `/api/courses/fr/lessons/${ONE}/attempt`;
      const started = async () =>
        (await seriesValue(lessonAttempts, { lang: 'fr', event: 'started' })) ?? 0;

      // Both wait on the course lock: the second sees the first one's row.
      const bothStarts = async (
        agent: Awaited<ReturnType<typeof learner>>['agent'],
        email: string,
      ) => {
        const { id } = await course(email);
        const before = await started();
        const both = await Promise.all([
          agent.post(url).send({ locale: 'en' }),
          agent.post(url).send({ locale: 'en' }),
        ]);
        expect(both.map((response) => response.status).sort()).toEqual([200, 201]);
        expect(both[0].body.attemptId).toBe(both[1].body.attemptId);
        expect(
          await prisma.lessonAttempt.findMany({ where: { userLevelId: id }, select: { id: true } }),
        ).toEqual([{ id: both[0].body.attemptId }]);
        expect(await started()).toBe(before + 1);
        return both[0].body.attemptId as string;
      };

      const fresh = await learner('double');
      await bothStarts(fresh.agent, fresh.email);

      const again = await learner('reboth');
      await playLesson(again.agent, prisma, 'fr', ONE);
      const { id } = await course(again.email);
      const done = await prisma.lessonAttempt.findFirstOrThrow({ where: { userLevelId: id } });
      expect(await bothStarts(again.agent, again.email)).not.toBe(done.id);
    });

    it('answers 404 lesson.notFound for an unknown, an unready or another language’s lesson', async () => {
      const { agent } = await learner('missing');
      await agent.post('/api/courses').send({ lang: 'de', dailyGoal: 10 }).expect(201);
      await agent.patch('/api/courses/de/level').send({ level: 'A1' }).expect(200);

      for (const path of [
        'fr/lessons/fr-test-att-nope',
        'fr/lessons/fr-test-att-draft',
        'fr/lessons/de-test-att-alpha',
        `de/lessons/${ONE}`,
      ]) {
        const response = await agent
          .post(`/api/courses/${path}/attempt`)
          .send({ locale: 'en' })
          .expect(404);
        expect(response.body.message, path).toBe('lesson.notFound');
      }
      expect(await prisma.lessonAttempt.count({ where: { lessonId: 'fr-test-att-draft' } })).toBe(
        0,
      );
    });
  });

  describe('practice', () => {
    let attempt: Awaited<ReturnType<typeof openAttempt>>;
    let practice: number;

    beforeAll(async () => {
      const { agent } = await learner('practice');
      attempt = await openAttempt(agent, prisma, 'fr', ONE);
      practice = pageOf(attempt.plan, 'practice');
      for (let index = 0; index < practice; index++) {
        await attempt.send(index).expect(200);
      }
    });

    it('answers 409 attempt.stale for another index than the cursor', async () => {
      for (const index of [practice + 1, practice - 1, 'abc']) {
        const response = await attempt.send(index as number, {}).expect(409);
        expect(response.body.message).toBe('attempt.stale');
      }
    });

    it('answers 400 attempt.invalidAnswer for an unknown ref, or one from another attempt, and locks nothing', async () => {
      const { agent } = await learner('other');
      const other = await openAttempt(agent, prisma, 'fr', ONE);
      const theirs = Object.keys(other.answers(practice))[0];
      const before = await attemptRow(attempt.attemptId);

      for (const ref of ['AAAAAAAAAAAAAAAA', theirs]) {
        const response = await attempt.send(practice, { [ref]: { text: 'x' } }).expect(400);
        expect(response.body.message).toBe('attempt.invalidAnswer');
      }
      expect(await attemptRow(attempt.attemptId)).toEqual(before);
    });

    it('answers with the feedback of that page only, and scores an empty unit 0', async () => {
      const page = attempt.plan.pages[practice];
      const [blank] = page.units;
      const body = attempt.answers(practice, (unit) => (unit === blank ? 'blank' : 'right'));

      const response = await attempt.send(practice, body).expect(200);
      const feedback: { ref: string; outcome: string; points: number }[] = response.body.feedback;

      // A unit's ref is the HMAC of its id (paths.unit).
      expect(feedback.map((unit) => unit.ref)).toEqual(
        page.units.map((unit) => attempt.ref(unit.id)),
      );
      expect(feedback[0]).toMatchObject({ outcome: 'unanswered', points: 0 });
      for (const unit of feedback.slice(1)) {
        expect(unit).toMatchObject({ outcome: 'fully_correct', points: 1 });
        expect(unit).toHaveProperty('answer');
        expect(unit).toHaveProperty('explanation');
      }
      expect(response.body.attempt.current.index).toBe(practice + 1);
      expect(response.body.attempt.practice.earned).toBe(page.units.length - 1);
      expect(leaks(response.body.attempt)).toEqual([]);
    });

    it('answers 409 attempt.stale for the same page again', async () => {
      const response = await attempt.send(practice).expect(409);

      expect(response.body.message).toBe('attempt.stale');
    });
  });

  describe('exam', () => {
    /** A learner at the exam page: the answer to Start the exam, and the attempt. */
    const atTheExam = async (name: string) => {
      const { agent } = await learner(name);
      const attempt = await openAttempt(agent, prisma, 'fr', ONE);
      const intro = pageOf(attempt.plan, 'examIntro');
      // Every attempt the learner gets, from a submit or a GET. Not the outline:
      // its `points` are the lesson's learning points, not a score.
      const seen: unknown[] = [attempt.started, (await agent.get(attempt.url)).body.attempt];
      for (let index = 0; index < intro; index++) {
        const response = await attempt.send(index).expect(200);
        // A practice page's own feedback is the only key allowed before the results.
        if (attempt.plan.pages[index].role !== 'practice') {
          expect(response.body.feedback, `page ${index}`).toBeNull();
        }
        seen.push(response.body.attempt, (await agent.get(attempt.url)).body.attempt);
      }
      const start = await attempt.send(intro).expect(200);
      seen.push(start.body, (await agent.get(attempt.url)).body.attempt);
      return { agent, attempt, exam: intro + 1, start: start.body, seen };
    };

    /** The results rows of the exam step. */
    const examRows = (results: {
      steps: { role: string }[];
      rows: { step: number; outcome: string; timedOut: boolean }[];
    }) => results.rows.filter((row) => results.steps[row.step].role === 'exam');

    it('answers Start the exam with exam page 1 and its countdown, and leaks no key before the results', async () => {
      const { start, exam, seen } = await atTheExam('leaks');

      expect(start.feedback).toBeNull();
      expect(start.attempt.current).toMatchObject({ index: exam, role: 'exam' });
      expect(start.attempt.remainingMs).toBe(80_000);
      expect(seen.flatMap((body) => leaks(body))).toEqual([]);
    });

    it('grades an exam page that comes in inside the 2 s grace', async () => {
      const { attempt, exam } = await atTheExam('grace');
      vi.setSystemTime(Date.now() + 80_000 + 1_500);

      const response = await attempt.send(exam).expect(200);
      const rows = examRows(response.body.attempt.results);

      expect(rows).toHaveLength(4);
      expect(rows.every((row) => row.outcome === 'fully_correct' && !row.timedOut)).toBe(true);
    });

    it('locks a later one blank and Out of time; a GET after the deadline changes no row', async () => {
      const { agent, attempt, exam } = await atTheExam('late');
      vi.setSystemTime(Date.now() + 80_000 + 2_500);

      const before = await attemptRow(attempt.attemptId);
      const read = await agent.get(attempt.url).expect(200);
      expect(read.body.attempt.remainingMs).toBe(0);
      expect(await attemptRow(attempt.attemptId)).toEqual(before);

      const response = await attempt.send(exam).expect(200);
      const rows = examRows(response.body.attempt.results);

      expect(rows).toHaveLength(4);
      expect(rows.every((row) => row.outcome === 'unanswered' && row.timedOut)).toBe(true);
    });
  });

  describe('close', () => {
    it('writes the result once with the server’s score, and meets the goal once', async () => {
      const { agent, email } = await learner('close');
      const counts = async () => [
        await seriesValue(lessonAttempts, { lang: 'fr', event: 'started' }),
        await seriesValue(lessonAttempts, { lang: 'fr', event: 'completed' }),
      ];
      const [started, completed] = (await counts()) as number[];

      const last = await playToLast(agent, prisma, 'fr', ONE);
      const response = await last().expect(200);
      const { id } = await course(email);
      const results = await prisma.lessonResult.findMany({ where: { userLevelId: id } });

      expect(response.body.attempt.current).toBeNull();
      expect(response.body.attempt.results).toMatchObject({
        score: 100,
        finish: { countedToday: true, doneCount: 1, target: 1, goalJustMet: true, best: 100 },
      });
      expect(results).toMatchObject([{ lessonId: ONE, score: 100 }]);
      expect(await course(email)).toMatchObject({ streak: 1, lastGoalDay: new Date(today) });
      expect(await counts()).toEqual([started + 1, completed + 1]);

      // The replay: 409, and nothing moves.
      const row = await prisma.lessonAttempt.findFirstOrThrow({ where: { userLevelId: id } });
      const replay = await last().expect(409);
      expect(replay.body.message).toBe('attempt.stale');
      expect(await prisma.lessonResult.findMany({ where: { userLevelId: id } })).toEqual(results);
      expect(await attemptRow(row.id)).toEqual(row);
      expect(await course(email)).toMatchObject({ streak: 1 });
    });

    it('gives one finish for two parallel last submits', async () => {
      const { agent, email } = await learner('parallel');
      const last = await playToLast(agent, prisma, 'fr', ONE);

      const both = await Promise.all([last(), last()]);
      const { id } = await course(email);

      expect(both.map((response) => response.status).sort()).toEqual([200, 409]);
      expect(await prisma.lessonResult.count({ where: { userLevelId: id } })).toBe(1);
      expect(await course(email)).toMatchObject({ streak: 1, lastGoalDay: new Date(today) });
    });
  });

  it('retakes after the results: a higher score raises the best, even on the same day; a lower one keeps it', async () => {
    const { agent, email } = await learner('retake');
    const { id } = await course(email);
    const attemptOf = () => prisma.lessonAttempt.findFirstOrThrow({ where: { userLevelId: id } });
    const saved = async () =>
      (await prisma.lessonResult.findFirstOrThrow({ where: { userLevelId: id } })).score;

    const low = await playLesson(agent, prisma, 'fr', ONE, 'blank');
    const first = await attemptOf();
    const high = await playLesson(agent, prisma, 'fr', ONE, 'right');
    const second = await attemptOf();

    expect(low).toMatchObject({ score: 0, finish: { best: 0, countedToday: true } });
    expect(high).toMatchObject({ score: 100, finish: { best: 100, countedToday: false } });
    expect(await saved()).toBe(100);
    expect(second.id).not.toBe(first.id);
    expect(Buffer.compare(second.secret, first.secret)).not.toBe(0);
    expect(await prisma.lessonAttempt.count({ where: { userLevelId: id } })).toBe(1);

    const lower = await playLesson(agent, prisma, 'fr', ONE, 'blank');
    expect(lower).toMatchObject({ score: 0, finish: { best: 100 } });
    expect(await saved()).toBe(100);
  });

  /**
   * The seed runs on a copy of the real content, plus an outline file of one
   * test lesson on the short brief: without the real files, the lessons
   * already in the database would count as deleted.
   */
  it('deletes the unfinished attempts of a lesson a reseed changes: the old id is stale, a start makes a new one', async () => {
    const realDir = dirname(findContentDir('outlines'));
    contentDir = join(await mkdtemp(join(tmpdir(), 'attempt-reseed-')), 'content');
    for (const folder of ['outlines', 'briefs', 'lessons']) {
      await mkdir(join(contentDir, folder), { recursive: true });
      for (const name of await readdir(join(realDir, folder))) {
        await copyFile(join(realDir, folder, name), join(contentDir, folder, name));
      }
    }
    const brief = JSON.parse(
      await readFile(
        join(
          __dirname,
          '../../../packages/shared/test/fixtures/content/briefs/fr-classroom-objects.json',
        ),
        'utf8',
      ),
    );
    const write = async (title: string) => {
      const entry = {
        id: RESEEDED,
        kind: 'vocabulary',
        theme: 'education',
        workingTitle: 'Planned',
        intent: 'Planned.',
      };
      await writeFile(
        join(contentDir!, 'outlines', 'fr-test.json'),
        JSON.stringify({ lang: 'fr', level: 'A1', entries: [entry] }),
      );
      await writeFile(
        join(contentDir!, 'briefs', `${RESEEDED}.json`),
        JSON.stringify({ ...brief, id: RESEEDED, title }),
      );
    };
    await write(brief.title);
    await seedLessons(contentDir, prisma);

    const { agent } = await learner('reseed');
    const old = await openAttempt(agent, prisma, 'fr', RESEEDED);
    await old.send(0).expect(200);

    await write(`${brief.title} bis`);
    expect(await seedLessons(contentDir, prisma)).toBe(1);

    const stale = await old.send(1).expect(409);
    expect(stale.body.message).toBe('attempt.stale');
    const fresh = await agent
      .post(`/api/courses/fr/lessons/${RESEEDED}/attempt`)
      .send({ locale: 'en' })
      .expect(201);
    expect(fresh.body.attemptId).not.toBe(old.attemptId);
    expect(fresh.body.current.index).toBe(0);
  });
});
