import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as OTPAuth from 'otpauth';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * The pending-session half of a 2FA login only exists once express-session, the
 * guard and the store run together, so it is proven end to end. Needs a real
 * Postgres and Redis, which CI provides as services.
 */
describe('two factor (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const stamp = Date.now();
  const email = `totp-${stamp}@example.com`;
  const displayName = `totp${stamp}`;
  const password = 'Correct-Horse-9';

  let secret = '';
  let recoveryCodes: string[] = [];

  const server = () => app.getHttpServer();

  /**
   * The login throttler counts per IP, and this suite logs in more times than a
   * single address is allowed to. Each agent claims its own TEST-NET-3 address,
   * which also proves `trust proxy` resolves the forwarded header.
   */
  let addresses = 0;
  const agentFrom = () => {
    addresses += 1;
    return request.agent(server()).set('X-Forwarded-For', `203.0.113.${addresses}`);
  };
  const codeNow = () =>
    new OTPAuth.TOTP({
      issuer: 'ft_transcendence',
      label: email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    }).generate();

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

  it('enrols: setup returns a QR, and a real code enables the factor', async () => {
    const agent = agentFrom();
    await agent.post('/api/auth/signup').send({ email, displayName, password }).expect(201);

    const before = await agent.get('/api/auth/2fa').expect(200);
    expect(before.body).toMatchObject({ enabled: false, enrolmentPending: false });

    const setup = await agent.post('/api/auth/2fa/setup').expect(200);
    secret = setup.body.secret;
    expect(setup.body.qrDataUrl).toMatch(/^data:image\//);

    // Enrolment stored but not active, so an abandoned setup cannot lock anyone out.
    const pending = await agent.get('/api/auth/2fa').expect(200);
    expect(pending.body).toMatchObject({ enabled: false, enrolmentPending: true });

    await agent.post('/api/auth/2fa/enable').send({ code: '000000' }).expect(401);

    const enabled = await agent.post('/api/auth/2fa/enable').send({ code: codeNow() }).expect(200);
    recoveryCodes = enabled.body.recoveryCodes;
    expect(recoveryCodes).toHaveLength(10);
  });

  it('login stops at 202 and the half-finished session cannot reach /me', async () => {
    const agent = agentFrom();

    const login = await agent.post('/api/auth/login').send({ email, password }).expect(202);
    expect(login.body).toEqual({ twoFactorRequired: true });
    expect(login.body).not.toHaveProperty('id');

    // The whole point of a separate session key: a pending login is not a login.
    await agent.get('/api/auth/me').expect(401);
  });

  it('completes with an authenticator code and issues a different session id', async () => {
    const agent = agentFrom();

    const login = await agent.post('/api/auth/login').send({ email, password }).expect(202);
    const pendingCookie = login.headers['set-cookie'][0];

    await agent.post('/api/auth/2fa/verify').send({ code: '000000' }).expect(401);

    const verified = await agent.post('/api/auth/2fa/verify').send({ code: codeNow() }).expect(200);
    expect(verified.body.email).toBe(email);
    expect(verified.headers['set-cookie'][0]).not.toBe(pendingCookie);

    await agent.get('/api/auth/me').expect(200);
  });

  it('refuses a second factor with no pending login', async () => {
    await request(server()).post('/api/auth/2fa/verify').send({ code: codeNow() }).expect(401);
  });

  it('accepts a recovery code once and never again', async () => {
    const agent = agentFrom();
    const code = recoveryCodes[0];

    await agent.post('/api/auth/login').send({ email, password }).expect(202);
    await agent.post('/api/auth/2fa/verify').send({ code }).expect(200);
    await agent.post('/api/auth/logout').expect(204);

    const replay = agentFrom();
    await replay.post('/api/auth/login').send({ email, password }).expect(202);
    await replay.post('/api/auth/2fa/verify').send({ code }).expect(401);
  });

  it('needs the password to disable, then logs in with one factor again', async () => {
    const agent = agentFrom();
    await agent.post('/api/auth/login').send({ email, password }).expect(202);
    await agent.post('/api/auth/2fa/verify').send({ code: codeNow() }).expect(200);

    await agent.delete('/api/auth/2fa').send({ password: 'Wrong-Horse-9' }).expect(401);
    await agent.delete('/api/auth/2fa').send({ password }).expect(204);

    const plain = agentFrom();
    await plain.post('/api/auth/login').send({ email, password }).expect(200);
    await plain.get('/api/auth/me').expect(200);
  });
});
