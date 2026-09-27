import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type PlacementQuestion, PlacementQuestionSchema, PlacementResultSchema } from '@ft/shared';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PlacementSessionService } from '../src/placement/placement-session.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { placementBank, wrongChoice } from './placement.fixtures';

/**
 * The routes only exist once the guard, the global Zod pipe and session handling
 * run together, and none of those fire when a controller method is called
 * directly. courses.e2e-spec.ts is the pattern followed.
 *
 * The bank may be empty (a fresh migrate) or hold the real rows (make seed, or
 * seed.e2e-spec, which leaves them behind), so the suite brings its own German
 * rows and looks every answer up by the served id.
 */
describe('placement (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agent: TestAgent;
  let other: TestAgent;
  const userIds: string[] = [];
  const bank = placementBank();

  const stamp = Date.now();
  const email = `placement-${stamp}@example.com`;
  const otherEmail = `placement-other-${stamp}@example.com`;

  const signUp = async (address: string, name: string) => {
    const fresh = request.agent(app.getHttpServer());
    const res = await fresh
      .post('/api/auth/signup')
      .send({ email: address, displayName: name, password: 'Correct-Horse-9' })
      .expect(201);
    userIds.push(res.body.id);
    return fresh;
  };

  const answer = async (as: TestAgent, question: PlacementQuestion, right = true) => {
    const row = await prisma.questionBank.findUniqueOrThrow({ where: { id: question.questionId } });
    return as
      .post('/api/placement/answers')
      .send({ questionId: row.id, choice: right ? row.answer : wrongChoice(row) })
      .expect(201);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.questionBank.createMany({ data: bank });

    agent = await signUp(email, `placement${stamp}`);
    other = await signUp(otherEmail, `other${stamp}`);
  });

  afterAll(async () => {
    const sessions = app.get(PlacementSessionService);
    await app
      .get(RedisService)
      .client.del(
        userIds.flatMap((id) => [
          sessions.evalKey(id),
          sessions.evalQuestionsKey(id),
          sessions.evalLockKey(id),
        ]),
      );
    // UserLevel and UserSeenQuestion cascade on the user, so the rows go with them.
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await prisma.questionBank.deleteMany({ where: { id: { in: bank.map((row) => row.id) } } });
    await app.close();
  });

  const server = () => app.getHttpServer();

  describe('the rules', () => {
    it.each([
      ['get', '/api/placement'],
      ['post', '/api/placement'],
      ['post', '/api/placement/answers'],
      ['delete', '/api/placement'],
    ] as const)('refuses an anonymous %s %s', async (method, path) => {
      await request(server())[method](path).expect(401);
    });

    it.each([
      ['/api/placement', { lang: 'klingon' }],
      ['/api/placement', {}],
      ['/api/placement/answers', { questionId: 'not-a-uuid', choice: 'ist' }],
      ['/api/placement/answers', { questionId: randomUUID() }],
    ])('rejects POST %s with %j', async (path, body) => {
      await agent.post(path).send(body).expect(400);
    });
  });

  describe('the round trip', () => {
    let first: PlacementQuestion;

    it('has no run to show or answer before one starts', async () => {
      const shown = await agent.get('/api/placement').expect(404);
      const answered = await agent
        .post('/api/placement/answers')
        .send({ questionId: randomUUID(), choice: 'ist' })
        .expect(404);

      expect([shown.body.message, answered.body.message]).toEqual([
        'placement.notFound',
        'placement.notFound',
      ]);
    });

    it('refuses to start before the course exists', async () => {
      const response = await agent.post('/api/placement').send({ lang: 'de' }).expect(409);

      expect(response.body.message).toBe('placement.onboardingIncomplete');
    });

    it('starts at B1 in the language asked for, once its course exists', async () => {
      await agent.post('/api/courses').send({ lang: 'de', dailyGoal: 30 }).expect(201);
      const other = await agent.post('/api/placement').send({ lang: 'fr' }).expect(409);
      expect(other.body.message).toBe('placement.onboardingIncomplete');

      const response = await agent.post('/api/placement').send({ lang: 'de' }).expect(201);

      first = PlacementQuestionSchema.parse(response.body);
      expect(first).toMatchObject({ level: 'B1', progress: { answered: 0 } });
    });

    // remainingS may tick between two requests; everything else must hold still.
    it('shows the same question, options in the same order, on every GET', async () => {
      for (const _reload of [1, 2]) {
        const { body } = await agent.get('/api/placement').expect(200);
        expect(body).toEqual({ ...first, remainingS: expect.any(Number) });
      }
    });

    it('refuses a second run, in any language', async () => {
      for (const lang of ['de', 'fr']) {
        const response = await agent.post('/api/placement').send({ lang }).expect(409);
        expect(response.body.message).toBe('placement.inProgress');
      }
    });

    it.each([
      [
        'a choice outside the options',
        400,
        'placement.invalidChoice',
        () => first.questionId,
        'nope',
      ],
      ['an answer to another question', 409, 'placement.questionMismatch', randomUUID, 'ist'],
    ])('rejects %s with %i', async (_, status, message, questionId, choice) => {
      const response = await agent
        .post('/api/placement/answers')
        .send({ questionId: questionId(), choice })
        .expect(status);

      expect(response.body.message).toBe(message);
    });

    it('serves the next question after an answer', async () => {
      const next = PlacementQuestionSchema.parse((await answer(agent, first)).body);

      expect(next.progress.answered).toBe(1);
      expect(next.questionId).not.toBe(first.questionId);
    });

    it('quits on DELETE', async () => {
      await agent.delete('/api/placement').expect(204);

      await agent.get('/api/placement').expect(404);
    });

    it('runs to a result and places the course there', async () => {
      let body = (await agent.post('/api/placement').send({ lang: 'de' }).expect(201)).body;
      // Pass B1, fail C1, pass B2: both directions, and a result that is neither end.
      while ('questionId' in body) {
        body = (await answer(agent, body, body.level !== 'C1')).body;
      }

      const result = PlacementResultSchema.parse(body);
      expect(result.targetLevel).toBe('C1');
      expect(result.report).toHaveLength(14);
      expect((await agent.get('/api/placement').expect(200)).body).toEqual(result);
      expect((await agent.get('/api/courses').expect(200)).body).toEqual({
        courses: [{ lang: 'de', level: 'C1', dailyGoal: 30 }],
        activeLang: 'de',
      });

      await agent.delete('/api/placement').expect(204);
    });
  });

  describe('other people', () => {
    it("keeps each user's run to themselves", async () => {
      await other.post('/api/courses').send({ lang: 'de', dailyGoal: 60 }).expect(201);
      const mine = (await agent.post('/api/placement').send({ lang: 'de' }).expect(201)).body;

      await other.get('/api/placement').expect(404);
      await other
        .post('/api/placement/answers')
        .send({ questionId: mine.questionId, choice: mine.options[0] })
        .expect(404);

      const theirs = (await other.post('/api/placement').send({ lang: 'de' }).expect(201)).body;
      expect((await agent.get('/api/placement').expect(200)).body.questionId).toBe(mine.questionId);
      expect((await other.get('/api/placement').expect(200)).body.questionId).toBe(
        theirs.questionId,
      );

      await other.delete('/api/placement').expect(204);
      await other.get('/api/placement').expect(404);
      await agent.get('/api/placement').expect(200);
      await agent.delete('/api/placement').expect(204);
    });
  });
});
