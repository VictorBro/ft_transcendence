import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEVELS, PlacementQuestionSchema, QUESTION_CATEGORIES } from '@ft/shared';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

/**
 * The lock, the Lua release, the relation filter that excludes seen questions
 * and the status codes only exist against a real app, Postgres and Redis.
 *
 * CI migrates but does not seed, and seed.e2e-spec may or may not have loaded the
 * real bank by the time this runs. So it brings four questions per German level
 * and category: two runs' worth, enough for a learner to finish and retake.
 */
const SHORT = { grammar: 'gram', vocabulary: 'voca', reading: 'read' } as const;
const FIXTURES = LEVELS.flatMap((level, l) =>
  QUESTION_CATEGORIES.flatMap((category) =>
    [0, 1, 2, 3].map((i) => ({
      sourceId: `de-${SHORT[category]}-97${l}${i}`,
      lang: 'de' as const,
      level,
      topic: 'pronouns' as const,
      category,
      question: `${level} ${category} fixture ${i}`,
      options: ['richtig', 'falsch-1', 'falsch-2', 'falsch-3'],
      answer: 'richtig',
      timeLimitS: 60,
    })),
  ),
);

describe('placement (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const stamp = Date.now();
  const emails: string[] = [];

  /** A signed-in learner with a German course and no level yet. */
  const learner = async (name: string): Promise<TestAgent> => {
    const agent = request.agent(app.getHttpServer());
    const email = `placement-${name}-${stamp}@example.com`;
    emails.push(email);
    await agent
      .post('/api/auth/signup')
      .send({
        email,
        displayName: `pl${name}${String(stamp).slice(-5)}`,
        password: 'Correct-Horse-9',
      })
      .expect(201);
    await agent.post('/api/courses').send({ lang: 'de', dailyGoal: 30 }).expect(201);
    return agent;
  };

  const answerOf = async (questionId: string) =>
    (await prisma.questionBank.findUniqueOrThrow({ where: { id: questionId } })).answer;

  /**
   * Answers until the result comes back. The wrong choice is taken from the
   * question itself, since the real bank may sit alongside these fixtures.
   */
  const play = async (agent: TestAgent, correct: boolean) => {
    let body = (await agent.post('/api/placement').send({ lang: 'de' }).expect(201)).body;
    while ('questionId' in body) {
      const answer = await answerOf(body.questionId);
      const choice = correct ? answer : body.options.find((option: string) => option !== answer);
      body = (
        await agent
          .post('/api/placement/answers')
          .send({ questionId: body.questionId, choice })
          .expect(201)
      ).body;
    }
    return body;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    await prisma.questionBank.createMany({ data: FIXTURES, skipDuplicates: true });
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    for (const { id } of users) {
      await redis.client.del([`placement:${id}`, `placement:${id}:lock`]);
    }
    // Courses and seen questions cascade from the user and from the question.
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.questionBank.deleteMany({
      where: { sourceId: { in: FIXTURES.map((f) => f.sourceId) } },
    });
    await app.close();
  });

  it('turns every route away without a session', async () => {
    const server = app.getHttpServer();

    await request(server).post('/api/placement').send({ lang: 'de' }).expect(401);
    await request(server).get('/api/placement').expect(401);
    await request(server).post('/api/placement/answers').send({}).expect(401);
    await request(server).delete('/api/placement').expect(401);
  });

  it('rejects a language that does not exist before looking for a course', async () => {
    const agent = await learner('lang');

    await agent.post('/api/placement').send({ lang: 'xx' }).expect(400);
  });

  it('refuses a language the learner has no course in', async () => {
    const agent = await learner('nocourse');

    const response = await agent.post('/api/placement').send({ lang: 'fr' }).expect(404);

    expect(response.body.message).toBe('course.notFound');
  });

  describe('one run', () => {
    let agent: TestAgent;
    let first: { questionId: string; options: string[] };

    beforeAll(async () => {
      agent = await learner('run');
      first = (await agent.post('/api/placement').send({ lang: 'de' }).expect(201)).body;
    });

    it('serves a B1 question in the strict shape, with no answer in it', () => {
      expect(PlacementQuestionSchema.safeParse(first).success).toBe(true);
      expect(first).toMatchObject({ level: 'B1' });
      expect(JSON.stringify(first)).not.toContain('"answer"');
    });

    it('records the question as seen before it is answered', async () => {
      await expect(
        prisma.userSeenQuestion.count({ where: { questionId: first.questionId } }),
      ).resolves.toBe(1);
    });

    it('refuses a second start while the run is going', async () => {
      const response = await agent.post('/api/placement').send({ lang: 'de' }).expect(409);

      expect(response.body.message).toBe('placement.inProgress');
    });

    it('gives the same question back on a refresh', async () => {
      const again = (await agent.get('/api/placement').expect(200)).body;

      expect(again.questionId).toBe(first.questionId);
      expect(again.options).toEqual(first.options);
    });

    it('refuses an answer to another question', async () => {
      const response = await agent
        .post('/api/placement/answers')
        .send({ questionId: '00000000-0000-4000-8000-000000000000', choice: null })
        .expect(409);

      expect(response.body.message).toBe('placement.questionMismatch');
    });

    it('refuses a choice that is not an option', async () => {
      const response = await agent
        .post('/api/placement/answers')
        .send({ questionId: first.questionId, choice: 'erfunden' })
        .expect(400);

      expect(response.body.message).toBe('placement.invalidChoice');
    });

    /** The real lock: two answers at once, and only one of them gets through. */
    it('lets only one of two simultaneous answers through', async () => {
      const choice = await answerOf(first.questionId);
      const send = () =>
        agent.post('/api/placement/answers').send({ questionId: first.questionId, choice });

      const statuses = (await Promise.all([send(), send()]))
        .map((response) => response.status)
        .toSorted();

      expect(statuses).toEqual([201, 409]);
    });

    it('quits with 204, twice, and there is nothing left to read', async () => {
      await agent.delete('/api/placement').expect(204);
      await agent.delete('/api/placement').expect(204);

      const response = await agent.get('/api/placement').expect(404);
      expect(response.body.message).toBe('placement.notFound');
    });
  });

  it('writes C2 for a perfect run, and lets a retake start straight after', async () => {
    const agent = await learner('perfect');

    const result = await play(agent, true);

    expect(result.level).toBe('C2');
    const courses = (await agent.get('/api/courses').expect(200)).body.courses;
    expect(courses).toEqual([expect.objectContaining({ lang: 'de', level: 'C2' })]);
    await agent.post('/api/placement').send({ lang: 'de' }).expect(201);
  });

  it('writes A1 for a run that gets nothing right, and keeps the result readable', async () => {
    const agent = await learner('zero');

    const result = await play(agent, false);

    expect(result.level).toBe('A1');
    expect(result.report).toHaveLength(4);
    await expect(agent.get('/api/placement').expect(200)).resolves.toMatchObject({ body: result });
  });

  /** Quitting a retake must never cost the level the learner already has. */
  it('leaves an existing level alone when a retake is quit', async () => {
    const agent = await learner('retake');
    await agent.patch('/api/courses/de/level').send({ level: 'B2' }).expect(200);

    const question = (await agent.post('/api/placement').send({ lang: 'de' }).expect(201)).body;
    await agent
      .post('/api/placement/answers')
      .send({ questionId: question.questionId, choice: null })
      .expect(201);
    await agent.delete('/api/placement').expect(204);

    const courses = (await agent.get('/api/courses').expect(200)).body.courses;
    expect(courses).toEqual([expect.objectContaining({ level: 'B2' })]);
  });
});
