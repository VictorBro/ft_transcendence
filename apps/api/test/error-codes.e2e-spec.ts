import { Controller, Get, INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { isErrorCode } from '@ft/shared';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * The browser's readCode reads `message` and translates it, so every error the
 * API sends there must be an ERROR_CODES entry. One case per source that once
 * sent English text instead (#108): the validation pipe, the `:lang` pipe, the
 * session guard and the throttler, then what ErrorCodeFilter catches before or
 * around them: an unreadable or oversized body, an unknown route and an
 * unhandled error.
 */

/** Crashes on purpose: what a bug in a handler looks like to the filter. */
@Controller('test-crash')
class CrashController {
  @Get()
  crash(): never {
    throw new Error('boom');
  }
}

describe('error codes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agent: TestAgent;

  const email = `codes-${Date.now()}@example.com`;
  const displayName = `codes${Date.now()}`;

  const server = () => app.getHttpServer();

  /**
   * The login throttler counts per IP. Each case claims its own TEST-NET-2
   * address, so no case spends another one's allowance.
   */
  let addresses = 0;
  const fromNewAddress = () => {
    addresses += 1;
    return `198.51.100.${addresses}`;
  };

  /** `message` is one code, or an array of them for a Zod failure. */
  const codesOf = (body: { message: unknown }): string[] =>
    Array.isArray(body.message) ? body.message : [String(body.message)];

  const expectOnlyCodes = (body: { message: unknown }) => {
    const codes = codesOf(body);
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect(isErrorCode(code), `not a declared code: ${code}`).toBe(true);
    }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [CrashController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    agent = request.agent(server()).set('X-Forwarded-For', fromNewAddress());
    await agent
      .post('/api/auth/signup')
      .send({ email, displayName, password: 'Correct-Horse-9' })
      .expect(201);
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email } });
    await app?.close();
  });

  it('sends the Zod codes of an invalid body in message', async () => {
    const response = await request(server())
      .post('/api/auth/signup')
      .set('X-Forwarded-For', fromNewAddress())
      .send({ email: 'nope', displayName: 'x', password: 'short' })
      .expect(400);

    expect(Array.isArray(response.body.message)).toBe(true);
    expect(response.body.message).toContain('email.invalid');
    expectOnlyCodes(response.body);
  });

  it('sends course.unknownLanguage for an unknown :lang', async () => {
    const response = await agent.patch('/api/courses/klingon').send({ dailyGoal: 10 }).expect(400);

    expect(response.body.message).toEqual(['course.unknownLanguage']);
    expectOnlyCodes(response.body);
  });

  it('sends auth.sessionRequired without a session', async () => {
    const response = await request(server()).get('/api/courses').expect(401);

    expect(response.body.message).toBe('auth.sessionRequired');
    expectOnlyCodes(response.body);
  });

  it('sends request.invalid for a body that is not JSON', async () => {
    const response = await request(server())
      .post('/api/auth/login')
      .set('X-Forwarded-For', fromNewAddress())
      .set('Content-Type', 'application/json')
      .send('{not json')
      .expect(400);

    expect(response.body.message).toBe('request.invalid');
  });

  it('sends request.invalid for a JSON body that is not an object', async () => {
    const response = await request(server())
      .post('/api/auth/login')
      .set('X-Forwarded-For', fromNewAddress())
      .send([1])
      .expect(400);

    expect(response.body.message).toEqual(['request.invalid']);
  });

  it('sends request.tooLarge for a body over the parser limit', async () => {
    // Express's JSON parser stops at 100 kB.
    const response = await request(server())
      .post('/api/auth/login')
      .set('X-Forwarded-For', fromNewAddress())
      .send({ email: 'a'.repeat(200_000), password: 'x' })
      .expect(413);

    expect(response.body.message).toBe('request.tooLarge');
  });

  it('sends server.unexpected for an unknown route', async () => {
    const response = await agent.get('/api/no-such-route').expect(404);

    expect(response.body.message).toBe('server.unexpected');
  });

  it('sends server.unexpected for an unhandled error, and logs it', async () => {
    // Silenced: the stack would clutter the test output.
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    try {
      // The agent has a session: without one, AuthGuard answers 401 first.
      const response = await agent.get('/api/test-crash').expect(500);

      expect(response.body.message).toBe('server.unexpected');
      expect(logged).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
    } finally {
      logged.mockRestore();
    }
  });

  it('sends server.rateLimited on the sixth login in a minute from one address', async () => {
    const address = fromNewAddress();
    const login = () =>
      request(server())
        .post('/api/auth/login')
        .set('X-Forwarded-For', address)
        .send({ email, password: 'Wrong-Horse-9' });

    for (let attempt = 1; attempt <= 5; attempt++) {
      await login().expect(401);
    }
    const response = await login().expect(429);

    expect(response.body.message).toBe('server.rateLimited');
    expectOnlyCodes(response.body);
  });
});
