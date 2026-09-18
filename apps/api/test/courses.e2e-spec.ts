import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * The routes only exist once the guard, the global Zod pipe and the `:lang`
 * pipe run together, and none of those fire when a controller method is called
 * directly. Everything the controller actually contributes is asserted here.
 */
describe('courses (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agent: TestAgent;
  let other: TestAgent;

  const stamp = Date.now();
  const email = `courses-${stamp}@example.com`;
  const otherEmail = `courses-other-${stamp}@example.com`;

  const signUp = async (address: string, name: string) => {
    const fresh = request.agent(app.getHttpServer());
    await fresh
      .post('/api/auth/signup')
      .send({ email: address, displayName: name, password: 'Correct-Horse-9' })
      .expect(201);
    return fresh;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    agent = await signUp(email, `courses${stamp}`);
    other = await signUp(otherEmail, `other${stamp}`);
  });

  afterAll(async () => {
    // UserLevel cascades on the user, so the rows go with them.
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await app.close();
  });

  const server = () => app.getHttpServer();

  describe('the round trip', () => {
    it('starts a course with no level yet', async () => {
      const response = await agent.post('/api/courses').send({ lang: 'fr', dailyGoal: 30 });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ lang: 'fr', level: null, dailyGoal: 30 });
    });

    it('lists it, with no active language until something is written', async () => {
      const response = await agent.get('/api/courses').expect(200);

      expect(response.body).toEqual({
        courses: [{ lang: 'fr', level: null, dailyGoal: 30 }],
        activeLang: null,
      });
    });

    it('changes the goal without touching the level', async () => {
      const response = await agent.patch('/api/courses/fr').send({ dailyGoal: 10 }).expect(200);

      expect(response.body).toEqual({ lang: 'fr', level: null, dailyGoal: 10 });
    });

    it('sets the level without touching the goal', async () => {
      const response = await agent.patch('/api/courses/fr/level').send({ level: 'B1' }).expect(200);

      expect(response.body).toEqual({ lang: 'fr', level: 'B1', dailyGoal: 10 });
    });

    // Written by both PATCH routes, so a bare sign-in knows where to land.
    it('leaves the active language on the course it just wrote', async () => {
      const response = await agent.get('/api/courses').expect(200);

      expect(response.body.activeLang).toBe('fr');
    });
  });

  describe('the rules', () => {
    it('refuses a second course in a language already studied', async () => {
      const response = await agent
        .post('/api/courses')
        .send({ lang: 'fr', dailyGoal: 60 })
        .expect(409);

      expect(response.body.message).toBe('course.alreadyStarted');
    });

    // The conflict must not have overwritten what the round trip left behind.
    it('leaves the existing goal untouched after that conflict', async () => {
      const response = await agent.get('/api/courses').expect(200);
      const french = response.body.courses.find((c: { lang: string }) => c.lang === 'fr');

      expect(french).toEqual({ lang: 'fr', level: 'B1', dailyGoal: 10 });
    });

    it('never creates a course implicitly from a goal change', async () => {
      const response = await agent.patch('/api/courses/de').send({ dailyGoal: 30 }).expect(404);

      expect(response.body.message).toBe('course.notFound');
    });

    it('never creates a course implicitly from a level change', async () => {
      const response = await agent.patch('/api/courses/de/level').send({ level: 'A1' }).expect(404);

      expect(response.body.message).toBe('course.notFound');
    });

    it('rejects a daily goal outside the three the picker offers', async () => {
      await agent.post('/api/courses').send({ lang: 'de', dailyGoal: 45 }).expect(400);
    });

    // The global pipe only sees bodies, so `:lang` carries its own.
    it('rejects a language that is not learnable', async () => {
      await agent.patch('/api/courses/klingon').send({ dailyGoal: 30 }).expect(400);
    });

    it('rejects a level the exam could never produce', async () => {
      await agent.patch('/api/courses/fr/level').send({ level: 'Z9' }).expect(400);
    });
  });

  /**
   * The discriminating case: onboarding is a question about (user, lang). A
   * learner who finished French still has to onboard German, and the absence of
   * a German course is the entire answer.
   */
  it('reports German as still to onboard while French is complete', async () => {
    const response = await agent.get('/api/courses').expect(200);
    const langs = response.body.courses.map((c: { lang: string }) => c.lang);

    expect(langs).toContain('fr');
    expect(langs).not.toContain('de');
    expect(response.body.courses.find((c: { lang: string }) => c.lang === 'fr').level).toBe('B1');
  });

  describe('other people', () => {
    it('refuses an anonymous caller', async () => {
      await request(server()).get('/api/courses').expect(401);
    });

    it('never lists a course belonging to someone else', async () => {
      await other.post('/api/courses').send({ lang: 'de', dailyGoal: 60 }).expect(201);

      const mine = await agent.get('/api/courses').expect(200);
      const theirs = await other.get('/api/courses').expect(200);

      expect(mine.body.courses.map((c: { lang: string }) => c.lang)).toEqual(['fr']);
      expect(theirs.body.courses.map((c: { lang: string }) => c.lang)).toEqual(['de']);
    });
  });
});
