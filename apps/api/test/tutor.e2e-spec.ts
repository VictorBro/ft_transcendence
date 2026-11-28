import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TutorCheckSchema, type TutorCheckStatus } from '@ft/shared';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { LLM_PROVIDER, type LlmProvider } from '../src/llm/llm.provider';
import { PrismaService } from '../src/prisma/prisma.service';
import { TutorService } from '../src/tutor/tutor.service';

/**
 * The AI tutor routes: GET /api/tutor (what the tutor runs on) and
 * POST /api/tutor/check (a test of the server's key). The suite runs on the
 * fixture (vitest.config.e2e.mts pins it), so a real ending is played by
 * stubbing the provider's check(): no test ever calls Google.
 */
describe('tutor (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let llm: LlmProvider;
  let tutor: TutorService;
  let agent: TestAgent;

  const stamp = Date.now();
  const emails: string[] = [];
  const server = () => app.getHttpServer();
  const CHECK = '/api/tutor/check';

  /** Each agent its own TEST-NET-2 address, so signups never meet their limit. */
  let addresses = 0;
  /**
   * A new account. The route allows 3 checks a minute per account, so every
   * case that posts more than once, or after another, signs up its own.
   */
  const fresh = async (): Promise<TestAgent> => {
    addresses += 1;
    const email = `tutor-${addresses}-${stamp}@example.com`;
    emails.push(email);
    const next = request.agent(server()).set('X-Forwarded-For', `198.51.100.${addresses}`);
    await next
      .post('/api/auth/signup')
      .send({ email, displayName: `tutor${addresses}x${stamp}`, password: 'Correct-Horse-9' })
      .expect(201);
    return next;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    llm = app.get(LLM_PROVIDER);
    tutor = app.get(TutorService);
    // One check answers everyone for 15 s: the cases would see each other's results.
    tutor.reuseMs = 0;
    agent = await fresh();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { in: emails } } });
    await app?.close();
  });

  it.each([
    ['GET', () => request(server()).get('/api/tutor')],
    ['POST', () => request(server()).post(CHECK)],
  ])('refuses %s without a session', async (_, send) => {
    const response = await send().expect(401);

    expect(response.body.message).toBe('auth.sessionRequired');
  });

  it('names the provider and no model on the fixture', async () => {
    const response = await agent.get('/api/tutor').expect(200);

    expect(response.body).toEqual({ provider: 'fixture', model: null });
  });

  it('answers the check on the fixture with nothing to check', async () => {
    const response = await agent.post(CHECK).expect(200);

    expect(TutorCheckSchema.parse(response.body)).toMatchObject({
      provider: 'fixture',
      model: null,
      status: 'fixture',
      latencyMs: null,
      httpStatus: null,
      retryAt: null,
    });
  });

  // A Record, so a status added to TUTOR_CHECK_STATUSES fails to compile here until it has a case.
  const HTTP_STATUS: Record<Exclude<TutorCheckStatus, 'fixture'>, number | null> = {
    ok: 200,
    invalid_key: 400,
    model_not_found: 404,
    quota: 429,
    quota_day: 429,
    unreachable: 503,
    unexpected: 402,
    disabled: null,
  };

  // Like health: a bad key is a verdict, not a failed request. A 429 carries
  // when Google said the quota comes back.
  it.each(Object.entries(HTTP_STATUS))(
    'answers 200 with the status %s',
    async (status, httpStatus) => {
      const retryAt = httpStatus === 429 ? '2026-11-28T08:00:00.000Z' : null;
      vi.spyOn(llm, 'check').mockResolvedValueOnce({
        status: status as TutorCheckStatus,
        latencyMs: 12,
        httpStatus,
        retryAt,
      });

      const response = await (await fresh()).post(CHECK).expect(200);

      expect(TutorCheckSchema.parse(response.body)).toMatchObject({
        status,
        latencyMs: 12,
        httpStatus,
        retryAt,
      });
    },
  );

  it('answers 200 unexpected when the provider breaks its promise and throws', async () => {
    vi.spyOn(llm, 'check').mockRejectedValueOnce(new Error('bug'));
    // TutorService logs the error on purpose: kept out of the test output.
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const response = await (await fresh()).post(CHECK).expect(200);

    expect(response.body).toMatchObject({
      status: 'unexpected',
      latencyMs: null,
      httpStatus: null,
      retryAt: null,
    });
    expect(logged).toHaveBeenCalled();
  });

  // Clicks from many accounts share one call to Google, so more accounts do not mean more calls.
  it("answers a second account with the first one's check", async () => {
    const check = vi
      .spyOn(llm, 'check')
      .mockResolvedValue({ status: 'ok', latencyMs: 12, httpStatus: 200, retryAt: null });
    const [one, two] = [await fresh(), await fresh()];
    try {
      // reuseMs is 0 here, so this one is a fresh check whatever ran before.
      const first = await one.post(CHECK).expect(200);
      tutor.reuseMs = 60_000;
      const second = await two.post(CHECK).expect(200);

      expect(check).toHaveBeenCalledOnce();
      expect(second.body).toEqual(first.body);
    } finally {
      tutor.reuseMs = 0;
    }
  });

  it('documents both routes in Swagger, under the tag tutor', async () => {
    const response = await request(server()).get('/api/docs-json').expect(200);
    const { paths } = response.body;

    expect(paths['/api/tutor'].get.tags).toEqual(['tutor']);
    expect(paths['/api/tutor'].get.responses).toHaveProperty('200');
    expect(paths['/api/tutor/check'].post.tags).toEqual(['tutor']);
    expect(Object.keys(paths['/api/tutor/check'].post.responses)).toEqual(
      expect.arrayContaining(['200', '401', '429']),
    );
  });

  // Last, and on its own account: it spends the whole allowance of the minute.
  it('limits the check to 3 a minute per account', async () => {
    const limited = await fresh();
    for (let i = 0; i < 3; i += 1) {
      await limited.post(CHECK).expect(200);
    }

    const response = await limited.post(CHECK).expect(429);

    expect(response.body.message).toBe('server.rateLimited');
  });
});
