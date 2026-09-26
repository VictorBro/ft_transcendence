import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PlacementQuestionSchema, PlacementResultSchema } from '@ft/shared';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

/**
 * The routes only exist once the guard, the global Zod pipe and session handling
 * run together, and none of those fire when a controller method is called
 * directly. Everything the controller actually contributes is asserted here.
 * courses.e2e-spec.ts is the pattern followed.
 */
describe('placement (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let agent: TestAgent;
  let other: TestAgent;
  let agentUserId: string;
  let otherUserId: string;

  const stamp = Date.now();
  const email = `placement-${stamp}@example.com`;
  const otherEmail = `placement-other-${stamp}@example.com`;

  const signUp = async (address: string, name: string) => {
    const fresh = request.agent(app.getHttpServer());
    const res = await fresh
      .post('/api/auth/signup')
      .send({ email: address, displayName: name, password: 'Correct-Horse-9' })
      .expect(201);
    return { agent: fresh, userId: res.body.id as string };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

    const agentSetup = await signUp(email, `placement${stamp}`);
    agent = agentSetup.agent;
    agentUserId = agentSetup.userId;

    const otherSetup = await signUp(otherEmail, `other${stamp}`);
    other = otherSetup.agent;
    otherUserId = otherSetup.userId;
  });

  afterAll(async () => {
    if (agentUserId) {
      await redis.client.del([
        `user:${agentUserId}:eval`,
        `user:${agentUserId}:eval_questions`,
        `user:${agentUserId}:eval_lock`,
      ]);
    }
    if (otherUserId) {
      await redis.client.del([
        `user:${otherUserId}:eval`,
        `user:${otherUserId}:eval_questions`,
        `user:${otherUserId}:eval_lock`,
      ]);
    }
    // UserLevel and UserSeenQuestion cascade on the user, so the rows go with them.
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await app.close();
  });

  const server = () => app.getHttpServer();

  describe('the round trip', () => {
    it('returns 404 when querying an exam before starting one', async () => {
      const response = await agent.get('/api/placement').expect(404);
      expect(response.body.message).toBe('placement.notFound');
    });

    it('refuses to start an exam if onboarding is incomplete for the language', async () => {
      const response = await agent.post('/api/placement').send({ lang: 'de' }).expect(409);
      expect(response.body.message).toBe('placement.onboardingIncomplete');
    });

    it('starts a placement exam once the course onboarding is started', async () => {
      // Create course in German
      await agent.post('/api/courses').send({ lang: 'de', dailyGoal: 30 }).expect(201);

      const response = await agent.post('/api/placement').send({ lang: 'de' }).expect(201);

      const parsed = PlacementQuestionSchema.parse(response.body);
      expect(parsed.level).toBe('B1');
      expect(parsed.progress.answered).toBe(0);
      expect(parsed.progress.maxRemaining).toBeGreaterThanOrEqual(1);
      expect(parsed.options).toHaveLength(4);
    });

    it('retrieves the active question idempotently via GET', async () => {
      const firstGet = await agent.get('/api/placement').expect(200);
      const secondGet = await agent.get('/api/placement').expect(200);

      expect(firstGet.body).toEqual(secondGet.body);
      const parsed = PlacementQuestionSchema.parse(firstGet.body);
      expect(parsed.progress.answered).toBe(0);
    });

    it('advances to the next question when submitting a valid answer', async () => {
      const current = (await agent.get('/api/placement').expect(200)).body;

      const response = await agent
        .post('/api/placement/answers')
        .send({ questionId: current.questionId, choice: current.options[0] })
        .expect(201);

      const parsed = PlacementQuestionSchema.parse(response.body);
      expect(parsed.progress.answered).toBe(1);
      expect(parsed.questionId).not.toBe(current.questionId);
    });

    it('quits the active exam on DELETE and cleans up state', async () => {
      await agent.delete('/api/placement').expect(204);

      const response = await agent.get('/api/placement').expect(404);
      expect(response.body.message).toBe('placement.notFound');
    });

    it('completes an exam to final result and updates user level in database', async () => {
      // Start fresh placement exam in German
      const startRes = await agent.post('/api/placement').send({ lang: 'de' }).expect(201);
      let current = startRes.body;

      // Answer questions until exam reaches terminal state (result)
      while (!('targetLevel' in current)) {
        const nextRes = await agent
          .post('/api/placement/answers')
          .send({ questionId: current.questionId, choice: current.options[0] })
          .expect(201);
        current = nextRes.body;
      }

      const result = PlacementResultSchema.parse(current);
      expect(result.targetLevel).toBeDefined();
      expect(result.report.length).toBeGreaterThan(0);

      // GET /api/placement should return the same completed result
      const getRes = await agent.get('/api/placement').expect(200);
      expect(getRes.body).toEqual(result);

      // The course level in the database must now reflect the placement targetLevel
      const coursesRes = await agent.get('/api/courses').expect(200);
      const deCourse = coursesRes.body.courses.find((c: { lang: string }) => c.lang === 'de');
      expect(deCourse.level).toBe(result.targetLevel);
      expect(coursesRes.body.activeLang).toBe('de');

      // Clean up finished exam
      await agent.delete('/api/placement').expect(204);
    });
  });

  describe('the rules', () => {
    beforeAll(async () => {
      // Start course in French for rules testing
      await agent.post('/api/courses').send({ lang: 'fr', dailyGoal: 10 }).expect(201);
    });

    it('refuses an anonymous caller on all placement routes', async () => {
      await request(server()).get('/api/placement').expect(401);
      await request(server()).post('/api/placement').send({ lang: 'fr' }).expect(401);
      await request(server())
        .post('/api/placement/answers')
        .send({ questionId: '00000000-0000-0000-0000-000000000000', choice: 'test' })
        .expect(401);
      await request(server()).delete('/api/placement').expect(401);
    });

    it('rejects an invalid language in start placement via Zod pipe', async () => {
      await agent.post('/api/placement').send({ lang: 'klingon' }).expect(400);
      await agent.post('/api/placement').send({}).expect(400);
    });

    it('rejects invalid payload shapes on answers route via Zod pipe', async () => {
      // Invalid UUID format
      await agent
        .post('/api/placement/answers')
        .send({ questionId: 'not-a-valid-uuid', choice: 'option' })
        .expect(400);

      // Missing choice field
      await agent
        .post('/api/placement/answers')
        .send({ questionId: '00000000-0000-0000-0000-000000000000' })
        .expect(400);
    });

    it('returns 404 when submitting an answer with no active exam', async () => {
      const response = await agent
        .post('/api/placement/answers')
        .send({ questionId: '00000000-0000-0000-0000-000000000000', choice: 'option' })
        .expect(404);
      expect(response.body.message).toBe('placement.notFound');
    });

    it('refuses to start a concurrent exam when one is already in progress', async () => {
      await agent.post('/api/placement').send({ lang: 'fr' }).expect(201);

      const conflict = await agent.post('/api/placement').send({ lang: 'fr' }).expect(409);
      expect(conflict.body.message).toBe('placement.inProgress');

      // Also cannot start an exam for another language while one is active
      const secondConflict = await agent.post('/api/placement').send({ lang: 'de' }).expect(409);
      expect(secondConflict.body.message).toBe('placement.inProgress');
    });

    it('rejects an answer choice that is not among the question options', async () => {
      const current = (await agent.get('/api/placement').expect(200)).body;

      const response = await agent
        .post('/api/placement/answers')
        .send({ questionId: current.questionId, choice: 'not_one_of_the_options' })
        .expect(400);
      expect(response.body.message).toBe('placement.invalidChoice');
    });

    it('rejects an answer when the question ID does not match active question', async () => {
      const response = await agent
        .post('/api/placement/answers')
        .send({ questionId: '00000000-0000-0000-0000-000000000000', choice: 'any' })
        .expect(409);
      expect(response.body.message).toBe('placement.questionMismatch');
    });

    afterAll(async () => {
      // Discard rules test exam
      await agent.delete('/api/placement').expect(204);
    });
  });

  describe('other people', () => {
    it('isolates placement sessions between different users', async () => {
      // Setup other user course in German
      await other.post('/api/courses').send({ lang: 'de', dailyGoal: 60 }).expect(201);

      // Start agent placement in French
      const agentQuestion = (await agent.post('/api/placement').send({ lang: 'fr' }).expect(201))
        .body;

      // Other user has no active placement yet
      await other.get('/api/placement').expect(404);

      // Other user cannot submit answers to agent's question
      await other
        .post('/api/placement/answers')
        .send({ questionId: agentQuestion.questionId, choice: agentQuestion.options[0] })
        .expect(404);

      // Other user starts their own exam in German
      const otherQuestion = (await other.post('/api/placement').send({ lang: 'de' }).expect(201))
        .body;

      // Each sees their own distinct question
      const agentCurrent = (await agent.get('/api/placement').expect(200)).body;
      const otherCurrent = (await other.get('/api/placement').expect(200)).body;

      expect(agentCurrent.questionId).toBe(agentQuestion.questionId);
      expect(otherCurrent.questionId).toBe(otherQuestion.questionId);

      // Quitting other user's exam leaves agent's exam untouched
      await other.delete('/api/placement').expect(204);
      await other.get('/api/placement').expect(404);
      await agent.get('/api/placement').expect(200);

      // Clean up agent's exam
      await agent.delete('/api/placement').expect(204);
    });
  });
});
