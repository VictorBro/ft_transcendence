import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';

import { EXTRA_COUNT, LESSONS_PAGE_SIZE, type LessonCard } from '@ft/shared';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { localDay, previousDay } from '../src/lessons/roadmap.rules';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * The three lesson reads, end to end: the guard, the `:lang` pipe, the global
 * Zod pipe on the query, the service against a real Postgres, and Swagger.
 *
 * The cases run in order and the state builds up: first a course with no
 * level, then A1 with two results, then a switch to A2.
 *
 * The clock is frozen at noon UTC on the real day, for the test and the app
 * alike, since they run in the same process. Without that, a run that
 * crosses midnight UTC would compute `today` on one day and ask the API on the
 * next. UTC is the time zone of a fresh account. Only Date is faked:
 * setTimeout and the rest stay real, so Postgres, Redis and supertest are
 * untouched. shouldAdvanceTime lets the frozen clock tick on from noon, so
 * two `new Date()` never give the same instant.
 */
describe('lessons (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agent: TestAgent;
  let other: TestAgent;

  const stamp = Date.now();
  const email = `lessons-${stamp}@example.com`;
  const otherEmail = `lessons-other-${stamp}@example.com`;

  const today = localDay(new Date(), 'UTC');
  const yesterday = previousDay(today);
  const tomorrow = new Date(Date.parse(today) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const NOON = new Date(`${today}T12:00:00.000Z`);

  // In every field of every brief: if it shows up in a response, the brief leaked.
  const MARKER = 'brief-secret-marker';
  const brief = {
    objective: MARKER,
    points: [MARKER],
    examples: [MARKER],
    pitfalls: [MARKER],
    vocabulary: [{ term: MARKER, gloss: MARKER }],
  };

  // Letters only in the ids: LESSON_ID_PATTERN refuses digits. High positions,
  // so they never get in the way of real lessons. Every title says "testeur",
  // a word no real lesson uses, so `q=testeur` keeps only these.
  const FIXTURES = [
    {
      id: 'fr-test-alpha',
      lang: 'fr',
      level: 'A1',
      position: 9001,
      kind: 'grammar',
      topic: 'nouns_and_determiners',
      theme: null,
      title: 'Le cœur du testeur',
      summary: 'Une leçon de test.',
    },
    {
      id: 'fr-test-beta',
      lang: 'fr',
      level: 'A1',
      position: 9002,
      kind: 'grammar',
      topic: 'pronouns',
      theme: null,
      title: 'La cour du testeur',
      summary: 'Une autre leçon de test.',
    },
    {
      id: 'fr-test-gamma',
      lang: 'fr',
      level: 'A1',
      position: 9003,
      kind: 'vocabulary',
      topic: null,
      theme: 'daily_life',
      title: 'Les mots du testeur',
      summary: 'Le jardinier range ses outils.',
    },
    {
      id: 'fr-test-delta',
      lang: 'fr',
      level: 'A2',
      position: 9001,
      kind: 'grammar',
      topic: 'pronouns',
      theme: null,
      title: 'Le deuxième niveau du testeur',
      summary: 'Une leçon de test en A2.',
    },
    {
      id: 'de-test-alpha',
      lang: 'de',
      level: 'A1',
      position: 9001,
      kind: 'grammar',
      topic: 'nouns_and_determiners',
      theme: null,
      title: 'Das Mädchen des Testers',
      summary: 'Eine Testlektion.',
    },
  ] as const;
  // Not ready, before the fixtures above: the lesson list shows it, but today
  // never proposes it nor counts it. No "testeur" in it, so `q=testeur` skips it.
  const DRAFT = {
    id: 'fr-test-draft',
    lang: 'fr',
    level: 'A1',
    position: 9000,
    kind: 'grammar',
    topic: 'pronouns',
    theme: null,
    title: 'Le brouillon du rédacteur',
    summary: 'Une leçon sans fichiers.',
  } as const;
  const FIXTURE_IDS = [...FIXTURES.map((lesson) => lesson.id), DRAFT.id];

  const signUp = async (address: string, name: string) => {
    const fresh = request.agent(app.getHttpServer());
    await fresh
      .post('/api/auth/signup')
      .send({ email: address, displayName: name, password: 'Correct-Horse-9' })
      .expect(201);
    return fresh;
  };

  const ids = (cards: LessonCard[]) => cards.map((card) => card.id);
  const card = (cards: LessonCard[], id: string) => cards.find((c) => c.id === id);

  /**
   * The ids of a French level's ready lessons, by position: the real ones and
   * the fixtures. What plan() offers is read off this, so the tests hold
   * whatever is seeded.
   */
  const levelIds = async (level: 'A1' | 'A2') => {
    const lessons = await prisma.lesson.findMany({
      where: { lang: 'fr', level, ready: true },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    return lessons.map((lesson) => lesson.id);
  };

  /** The user's French course, for the rows the API has no route to write. */
  const frenchCourse = () =>
    prisma.userLevel.findFirstOrThrow({ where: { user: { email }, lang: 'fr' } });

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
    await prisma.lesson.createMany({
      data: [
        ...FIXTURES.map((lesson) => ({ ...lesson, brief, ready: true })),
        { ...DRAFT, brief: {}, ready: false },
      ],
    });

    agent = await signUp(email, `lessons${stamp}`);
    other = await signUp(otherEmail, `lessonsother${stamp}`);
    await agent.post('/api/courses').send({ lang: 'fr', dailyGoal: 30 }).expect(201);
  });

  afterAll(async () => {
    // The users first: UserLevel and then LessonResult cascade with them, and
    // Restrict would block deleting lessons that still have results.
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await prisma.lesson.deleteMany({ where: { id: { in: FIXTURE_IDS } } });
    await app.close();
    vi.useRealTimers();
  });

  const server = () => app.getHttpServer();

  describe('who may ask', () => {
    it.each([
      '/api/courses/fr/today',
      '/api/courses/fr/lessons',
      '/api/courses/fr/lessons/fr-test-alpha',
    ])('refuses an anonymous caller on %s', async (path) => {
      await request(server()).get(path).expect(401);
    });

    it.each(['today', 'lessons', 'lessons/fr-test-alpha'])(
      'rejects a language that is not learnable on %s',
      async (path) => {
        await agent.get(`/api/courses/klingon/${path}`).expect(400);
      },
    );
  });

  describe('before placement', () => {
    it.each(['today', 'lessons', 'lessons/de-test-alpha', 'lessons/NOT_AN_ID'])(
      'answers 404 course.notFound on %s without a German course',
      async (path) => {
        const response = await agent.get(`/api/courses/de/${path}`).expect(404);

        expect(response.body.message).toBe('course.notFound');
      },
    );

    it.each(['today', 'lessons'])('answers 409 course.notPlaced on %s', async (path) => {
      const response = await agent.get(`/api/courses/fr/${path}`).expect(409);

      expect(response.body.message).toBe('course.notPlaced');
    });

    it('still opens a single lesson, as todo', async () => {
      const response = await agent.get('/api/courses/fr/lessons/fr-test-alpha').expect(200);

      expect(response.body).toEqual({
        id: 'fr-test-alpha',
        level: 'A1',
        position: 9001,
        kind: 'grammar',
        topic: 'nouns_and_determiners',
        theme: null,
        title: 'Le cœur du testeur',
        summary: 'Une leçon de test.',
        status: 'todo',
        score: null,
        day: null,
        finishedAt: null,
      });
      expect(JSON.stringify(response.body)).not.toContain(MARKER);
    });
  });

  describe('at A1, with a failed lesson today and a passed one yesterday', () => {
    beforeAll(async () => {
      await agent.patch('/api/courses/fr/level').send({ level: 'A1' }).expect(200);

      const course = await frenchCourse();
      await prisma.lessonResult.createMany({
        data: [
          {
            userLevelId: course.id,
            lessonId: 'fr-test-alpha',
            score: 40,
            day: new Date(today),
            finishedAt: new Date(),
          },
          {
            userLevelId: course.id,
            lessonId: 'fr-test-beta',
            score: 90,
            day: new Date(yesterday),
            finishedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        ],
      });
    });

    it.each(['today', 'lessons', 'lessons/fr-test-alpha', 'lessons/fr-test-beta'])(
      'never sends a brief on %s',
      async (path) => {
        const response = await agent.get(`/api/courses/fr/${path}`).expect(200);

        expect(JSON.stringify(response.body)).not.toContain(MARKER);
        expect(JSON.stringify(response.body)).not.toContain('"brief"');
      },
    );

    describe('today', () => {
      it('gives the day, the target and the goal not met yet', async () => {
        const response = await agent.get('/api/courses/fr/today').expect(200);

        expect(response.body.day).toBe(today);
        // A 30 minute goal over 10 minute lessons.
        expect(response.body.target).toBe(3);
        expect(response.body.met).toBe(false);
      });

      it('lists the lesson failed today in done, as failed', async () => {
        const response = await agent.get('/api/courses/fr/today').expect(200);

        expect(ids(response.body.done)).toEqual(['fr-test-alpha']);
        expect(response.body.done[0]).toMatchObject({
          status: 'failed',
          score: 40,
          day: today,
          level: 'A1',
        });
      });

      it('proposes the queue of plan(), never a lesson done today', async () => {
        const response = await agent.get('/api/courses/fr/today').expect(200);
        // The queue: the lessons not passed by position, without alpha done
        // today, then beta, passed yesterday. A target of 3, minus alpha: 2 proposed.
        const queue = [
          ...(await levelIds('A1')).filter((id) => id !== 'fr-test-alpha' && id !== 'fr-test-beta'),
          'fr-test-beta',
        ];

        expect(ids(response.body.proposed)).toEqual(queue.slice(0, 2));
        expect(ids(response.body.extra)).toEqual(queue.slice(2, 2 + EXTRA_COUNT));
      });

      it('never proposes a lesson that is not ready', async () => {
        const response = await agent.get('/api/courses/fr/today').expect(200);
        const ready = new Set(await levelIds('A1'));
        const offered = [...ids(response.body.proposed), ...ids(response.body.extra)];

        expect(offered.length).toBeGreaterThan(0);
        expect(offered.filter((id) => !ready.has(id))).toEqual([]);
        expect(offered).not.toContain(DRAFT.id);
      });

      it('counts the progress on the level from its results, over its ready lessons', async () => {
        const response = await agent.get('/api/courses/fr/today').expect(200);
        const total = await prisma.lesson.count({
          where: { lang: 'fr', level: 'A1', ready: true },
        });

        expect(response.body.progress).toMatchObject({
          total,
          attempted: 2,
          passed: 1,
          complete: false,
        });
        expect(response.body.levelAfter).toBe('A2');
      });

      it('has no streak on a fresh course', async () => {
        const response = await agent.get('/api/courses/fr/today').expect(200);

        expect(response.body.streak).toEqual({ current: 0, best: 0, today: false });
      });

      it('keeps a streak whose last goal day was yesterday', async () => {
        const course = await frenchCourse();
        await prisma.userLevel.update({
          where: { id: course.id },
          data: { streak: 4, bestStreak: 7, lastGoalDay: new Date(yesterday) },
        });

        const response = await agent.get('/api/courses/fr/today').expect(200);

        expect(response.body.streak).toEqual({ current: 4, best: 7, today: false });
      });

      it('says today counts when the last goal day is today', async () => {
        const course = await frenchCourse();
        await prisma.userLevel.update({
          where: { id: course.id },
          data: { lastGoalDay: new Date(today) },
        });

        const response = await agent.get('/api/courses/fr/today').expect(200);

        expect(response.body.streak).toEqual({ current: 4, best: 7, today: true });
      });

      it('drops a streak whose last goal day is older than yesterday', async () => {
        const course = await frenchCourse();
        await prisma.userLevel.update({
          where: { id: course.id },
          data: { lastGoalDay: new Date(previousDay(yesterday)) },
        });

        const response = await agent.get('/api/courses/fr/today').expect(200);

        expect(response.body.streak).toEqual({ current: 0, best: 7, today: false });
      });

      // A day ahead of the local one, as after flying west: the day stays on it.
      it('never goes back before the last goal day', async () => {
        const course = await frenchCourse();
        await prisma.userLevel.update({
          where: { id: course.id },
          data: { lastGoalDay: new Date(tomorrow) },
        });
        // Even when an expect fails: the next tests need today back.
        onTestFinished(async () => {
          await prisma.userLevel.update({
            where: { id: course.id },
            data: { streak: 0, bestStreak: 0, lastGoalDay: null },
          });
        });

        const plan = await agent.get('/api/courses/fr/today').expect(200);
        const page = await agent.get('/api/courses/fr/lessons').expect(200);

        expect(plan.body.day).toBe(tomorrow);
        expect(page.body.day).toBe(tomorrow);
      });

      it("never goes back before the newest result's day", async () => {
        const course = await frenchCourse();
        await prisma.lessonResult.create({
          data: {
            userLevelId: course.id,
            lessonId: 'fr-test-gamma',
            score: 90,
            day: new Date(tomorrow),
            finishedAt: new Date(),
          },
        });
        onTestFinished(async () => {
          await prisma.lessonResult.deleteMany({
            where: { userLevelId: course.id, lessonId: 'fr-test-gamma' },
          });
        });

        const plan = await agent.get('/api/courses/fr/today').expect(200);
        const page = await agent.get('/api/courses/fr/lessons').expect(200);

        expect(plan.body.day).toBe(tomorrow);
        expect(page.body.day).toBe(tomorrow);
      });

      it("reads the day in the user's time zone", async () => {
        // UTC+14: at noon UTC it is already 2 in the morning of the next day.
        const zone = 'Pacific/Kiritimati';
        await prisma.user.update({ where: { email }, data: { timeZone: zone } });
        onTestFinished(async () => {
          await prisma.user.update({ where: { email }, data: { timeZone: 'UTC' } });
        });

        const response = await agent.get('/api/courses/fr/today').expect(200);

        expect(response.body.day).toBe(localDay(new Date(), zone));
        expect(response.body.day > today).toBe(true);
      });
    });

    describe('lessons', () => {
      it('gives the day, the size of the level and the page size, ready or not', async () => {
        const response = await agent.get('/api/courses/fr/lessons').expect(200);
        const levelTotal = await prisma.lesson.count({ where: { lang: 'fr', level: 'A1' } });

        // Every row of the level, not only the ready ones that today counts.
        expect(levelTotal).toBeGreaterThan((await levelIds('A1')).length);
        expect(response.body).toMatchObject({
          day: today,
          levelTotal,
          total: levelTotal,
          page: 1,
          pageSize: LESSONS_PAGE_SIZE,
        });
      });

      it('lists only the current level', async () => {
        const response = await agent.get('/api/courses/fr/lessons?q=testeur').expect(200);

        expect(ids(response.body.items)).toEqual([
          'fr-test-alpha',
          'fr-test-beta',
          'fr-test-gamma',
        ]);
      });

      it('puts each result on its card', async () => {
        const response = await agent.get('/api/courses/fr/lessons?q=testeur').expect(200);

        expect(card(response.body.items, 'fr-test-alpha')).toMatchObject({
          status: 'failed',
          score: 40,
          day: today,
        });
        expect(card(response.body.items, 'fr-test-beta')).toMatchObject({
          status: 'done',
          score: 90,
          day: yesterday,
        });
        expect(card(response.body.items, 'fr-test-gamma')).toMatchObject({
          status: 'todo',
          score: null,
          day: null,
          finishedAt: null,
        });
      });

      it('finds coeur in Le cœur, but not in La cour', async () => {
        const response = await agent.get('/api/courses/fr/lessons?q=coeur du testeur').expect(200);
        const levelTotal = await prisma.lesson.count({ where: { lang: 'fr', level: 'A1' } });

        expect(response.body.levelTotal).toBe(levelTotal);
        expect(response.body.total).toBe(1);
        expect(ids(response.body.items)).toEqual(['fr-test-alpha']);
      });

      it('searches the summary too', async () => {
        // testeur too: jardinier is a real French word, a real lesson may use it.
        const response = await agent.get('/api/courses/fr/lessons?q=jardinier testeur').expect(200);

        expect(ids(response.body.items)).toEqual(['fr-test-gamma']);
      });

      it('keeps any of the listed statuses', async () => {
        const response = await agent
          .get('/api/courses/fr/lessons?q=testeur&status=failed,done')
          .expect(200);

        expect(ids(response.body.items)).toEqual(['fr-test-alpha', 'fr-test-beta']);
      });

      it('reads a repeated status key like a comma list', async () => {
        const response = await agent
          .get('/api/courses/fr/lessons?q=testeur&status=failed&status=done')
          .expect(200);

        expect(ids(response.body.items)).toEqual(['fr-test-alpha', 'fr-test-beta']);
      });

      it('needs every filter to match', async () => {
        const response = await agent
          .get('/api/courses/fr/lessons?q=testeur&status=todo,failed&kind=vocabulary')
          .expect(200);

        expect(ids(response.body.items)).toEqual(['fr-test-gamma']);
      });

      it('filters on topic and theme', async () => {
        const topic = await agent
          .get('/api/courses/fr/lessons?q=testeur&topic=pronouns')
          .expect(200);
        const theme = await agent
          .get('/api/courses/fr/lessons?q=testeur&theme=daily_life')
          .expect(200);

        expect(ids(topic.body.items)).toEqual(['fr-test-beta']);
        expect(ids(theme.body.items)).toEqual(['fr-test-gamma']);
      });

      it('sorts by score, never started last', async () => {
        const desc = await agent
          .get('/api/courses/fr/lessons?q=testeur&sort=score&dir=desc')
          .expect(200);
        const asc = await agent
          .get('/api/courses/fr/lessons?q=testeur&sort=score&dir=asc')
          .expect(200);

        expect(ids(desc.body.items)).toEqual(['fr-test-beta', 'fr-test-alpha', 'fr-test-gamma']);
        expect(ids(asc.body.items)).toEqual(['fr-test-alpha', 'fr-test-beta', 'fr-test-gamma']);
      });

      it('groups by status: failed, then todo, then done', async () => {
        const response = await agent
          .get('/api/courses/fr/lessons?q=testeur&group=status')
          .expect(200);

        expect(ids(response.body.items)).toEqual([
          'fr-test-alpha',
          'fr-test-gamma',
          'fr-test-beta',
        ]);
      });

      it('groups by day, today first and never started last, whatever the dir', async () => {
        for (const dir of ['asc', 'desc']) {
          const response = await agent
            .get(`/api/courses/fr/lessons?q=testeur&group=day&dir=${dir}`)
            .expect(200);

          expect(ids(response.body.items)).toEqual([
            'fr-test-alpha',
            'fr-test-beta',
            'fr-test-gamma',
          ]);
        }
      });

      it('falls back on the defaults for unknown values, never a 400', async () => {
        const response = await agent
          .get(
            '/api/courses/fr/lessons?q=testeur&sort=foo&dir=up&group=bar&kind=grammar,foo&page=0',
          )
          .expect(200);

        expect(response.body.page).toBe(1);
        expect(ids(response.body.items)).toEqual(['fr-test-alpha', 'fr-test-beta']);
      });

      it('brings a page past the end back to the last one', async () => {
        const response = await agent.get('/api/courses/fr/lessons?q=testeur&page=99').expect(200);

        expect(response.body.page).toBe(1);
        expect(response.body.total).toBe(3);
      });

      it('answers an empty page when nothing matches', async () => {
        const response = await agent.get('/api/courses/fr/lessons?q=introuvable-xyz').expect(200);

        expect(response.body).toMatchObject({ items: [], total: 0, page: 1 });
      });
    });

    describe('one lesson', () => {
      it('carries its result', async () => {
        const response = await agent.get('/api/courses/fr/lessons/fr-test-alpha').expect(200);

        expect(response.body).toMatchObject({ status: 'failed', score: 40, day: today });
        expect(typeof response.body.finishedAt).toBe('string');
      });

      it('opens a lesson of another level of the same language', async () => {
        const response = await agent.get('/api/courses/fr/lessons/fr-test-delta').expect(200);

        expect(response.body).toMatchObject({ id: 'fr-test-delta', level: 'A2', status: 'todo' });
      });

      it('answers 404 lesson.notFound for a lesson of another language', async () => {
        const response = await agent.get('/api/courses/fr/lessons/de-test-alpha').expect(404);

        expect(response.body.message).toBe('lesson.notFound');
      });

      it('answers 404 lesson.notFound for a lesson that does not exist', async () => {
        const response = await agent.get('/api/courses/fr/lessons/fr-test-nowhere').expect(404);

        expect(response.body.message).toBe('lesson.notFound');
      });

      it.each(['NOT_AN_ID', 'fr-test-1', `fr-${'a'.repeat(100)}`])(
        'answers 404 lesson.notFound for the malformed id %s',
        async (id) => {
          const response = await agent.get(`/api/courses/fr/lessons/${id}`).expect(404);

          expect(response.body.message).toBe('lesson.notFound');
        },
      );
    });

    describe('other people', () => {
      it("never shows someone else's results", async () => {
        await other.post('/api/courses').send({ lang: 'fr', dailyGoal: 10 }).expect(201);
        await other.patch('/api/courses/fr/level').send({ level: 'A1' }).expect(200);

        const lesson = await other.get('/api/courses/fr/lessons/fr-test-alpha').expect(200);
        const plan = await other.get('/api/courses/fr/today').expect(200);

        expect(lesson.body).toMatchObject({ status: 'todo', score: null });
        expect(plan.body.done).toEqual([]);
        expect(plan.body.target).toBe(1);
      });

      it('proposes the first lesson of the level, then the next ones as extra', async () => {
        // A 10 minute goal and no result: target 1, the queue is the level by position.
        const plan = await other.get('/api/courses/fr/today').expect(200);
        const level = await levelIds('A1');

        expect(ids(plan.body.proposed)).toEqual(level.slice(0, 1));
        expect(ids(plan.body.extra)).toEqual(level.slice(1, 1 + EXTRA_COUNT));
      });
    });

    // There is no locale parameter: what the learner reads is always the course language.
    it.each(['today', 'lessons?q=testeur', 'lessons/fr-test-alpha'])(
      'answers %s the same whatever the interface language',
      async (path) => {
        const english = await agent
          .get(`/api/courses/fr/${path}`)
          .set('Accept-Language', 'en')
          .expect(200);
        const french = await agent
          .get(`/api/courses/fr/${path}`)
          .set('Accept-Language', 'fr')
          .set('Cookie', 'NEXT_LOCALE=fr')
          .expect(200);

        expect(french.body).toEqual(english.body);
      },
    );
  });

  describe('after a switch to A2', () => {
    beforeAll(async () => {
      await agent.patch('/api/courses/fr/level').send({ level: 'A2' }).expect(200);
    });

    it('lists the A2 lessons, not the A1 ones', async () => {
      const response = await agent.get('/api/courses/fr/lessons?q=testeur').expect(200);
      const levelTotal = await prisma.lesson.count({ where: { lang: 'fr', level: 'A2' } });

      expect(ids(response.body.items)).toEqual(['fr-test-delta']);
      expect(response.body.levelTotal).toBe(levelTotal);
    });

    it('keeps the A1 lesson done today in done, with its own level', async () => {
      const response = await agent.get('/api/courses/fr/today').expect(200);

      expect(ids(response.body.done)).toEqual(['fr-test-alpha']);
      expect(response.body.done[0]).toMatchObject({ level: 'A1', status: 'failed' });
    });

    it('proposes from A2 only, and counts the progress on A2 only', async () => {
      const response = await agent.get('/api/courses/fr/today').expect(200);
      const level = await levelIds('A2');

      // No A2 result yet: the queue is A2 by position. A target of 3, minus
      // the A1 lesson done today: 2 proposed.
      expect(ids(response.body.proposed)).toEqual(level.slice(0, 2));
      expect(ids(response.body.extra)).toEqual(level.slice(2, 2 + EXTRA_COUNT));
      expect(response.body.progress).toMatchObject({
        total: level.length,
        attempted: 0,
        passed: 0,
      });
      expect(response.body.levelAfter).toBe('B1');
    });

    it('never sends a brief', async () => {
      const response = await agent.get('/api/courses/fr/today').expect(200);

      expect(JSON.stringify(response.body)).not.toContain(MARKER);
    });
  });

  describe('Swagger', () => {
    it('documents the three routes, and the search params', async () => {
      const response = await request(server()).get('/api/docs-json').expect(200);
      const paths = response.body.paths;

      expect(paths).toHaveProperty(['/api/courses/{lang}/today']);
      expect(paths).toHaveProperty(['/api/courses/{lang}/lessons']);
      expect(paths).toHaveProperty(['/api/courses/{lang}/lessons/{id}']);

      const params = (
        paths['/api/courses/{lang}/lessons'].get.parameters as { name: string }[]
      ).map((param) => param.name);
      expect(params).toEqual(
        expect.arrayContaining([
          'lang',
          'q',
          'status',
          'kind',
          'topic',
          'theme',
          'sort',
          'dir',
          'group',
          'page',
        ]),
      );
    });

    it('documents lang on every route', async () => {
      const response = await request(server()).get('/api/docs-json').expect(200);

      for (const path of ['today', 'lessons', 'lessons/{id}']) {
        const params = response.body.paths[`/api/courses/{lang}/${path}`].get.parameters as {
          name: string;
        }[];
        expect(params.map((param) => param.name)).toContain('lang');
      }
    });
  });
});
