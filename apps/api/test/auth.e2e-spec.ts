import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configureApp, SESSION_COOKIE } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * The session behaviour only exists once express-session, connect-redis and the
 * guard run together, so it is proven here rather than in a unit test. Needs a
 * real Postgres and Redis, which CI provides as services.
 */
describe('auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const email = `learner-${Date.now()}@example.com`;
  const displayName = `learner${Date.now()}`;
  const password = 'Correct-Horse-9';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('rejects a weak password with the shared schema rules', async () => {
    await request(server())
      .post('/api/auth/signup')
      .send({ email, displayName, password: 'short' })
      .expect(400);
  });

  it('signs up, sets an httpOnly session cookie, and never returns the hash', async () => {
    const response = await request(server())
      .post('/api/auth/signup')
      .send({ email, displayName, password })
      .expect(201);

    expect(response.body).toMatchObject({ email, displayName, role: 'USER' });
    expect(response.body).not.toHaveProperty('passwordHash');

    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toContain(SESSION_COOKIE);
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
  });

  it('refuses a duplicate email with 409', async () => {
    await request(server())
      .post('/api/auth/signup')
      .send({ email, displayName: `${displayName}2`, password })
      .expect(409);
  });

  it('401s on /me without a session', async () => {
    await request(server()).get('/api/auth/me').expect(401);
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    const wrong = await request(server())
      .post('/api/auth/login')
      .send({ email, password: 'Wrong-Horse-9' })
      .expect(401);
    const unknown = await request(server())
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password })
      .expect(401);

    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it('logs in, serves /me, and drops access after logout', async () => {
    const agent = request.agent(server());

    await agent.post('/api/auth/login').send({ email, password }).expect(200);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.email).toBe(email);

    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  // Session fixation: the id held before logging in must not be the id that
  // ends up authenticated.
  it('issues a different session id on login', async () => {
    const agent = request.agent(server());

    await agent.get('/api/auth/me').expect(401);
    const before = await agent.post('/api/auth/login').send({ email, password }).expect(200);
    const first = before.headers['set-cookie'][0];

    await agent.post('/api/auth/logout').expect(204);
    const after = await agent.post('/api/auth/login').send({ email, password }).expect(200);

    expect(after.headers['set-cookie'][0]).not.toBe(first);
  });

  it('leaves public routes reachable with the guard registered globally', async () => {
    await request(server()).get('/api/health').expect(200);
    await request(server()).get('/api/hello').expect(200);
  });
});
