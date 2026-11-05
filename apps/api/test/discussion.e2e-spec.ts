import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { FIXTURE_ANSWER, FIXTURE_FAILURES } from '../src/llm/fixture.provider';
import { LLM_PROVIDER, type LlmProvider } from '../src/llm/llm.provider';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * The lesson discussion, end to end, on the fixture provider: the checks that
 * answer with a status before the stream opens, then the stream itself, its
 * three failures, and the learner leaving midway.
 *
 * Not here until #145 lands: the 409 attempt.stale off the discussion page.
 */
describe('lesson discussion (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let llm: LlmProvider;
  let agent: TestAgent;
  let unplaced: TestAgent;

  const stamp = Date.now();
  const emails = [`discussion-${stamp}@example.com`, `discussion-unplaced-${stamp}@example.com`];

  // PR #142's reading sample as the brief of a ready test lesson, and a draft
  // next to it. Letters only in the ids, high positions, as lessons.e2e-spec does.
  const brief = JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        '../../packages/shared/test/fixtures/samples/briefs/fr-reading-a-text-message.json',
      ),
      'utf8',
    ),
  ) as object;
  const LESSON = {
    id: 'fr-test-discussion',
    lang: 'fr',
    level: 'A1',
    position: 9101,
    kind: 'reading',
    topic: null,
    theme: 'daily_life',
    title: 'Le message du testeur',
    summary: 'Une leçon de test.',
  } as const;
  const DRAFT = { ...LESSON, id: 'fr-test-discussion-draft', position: 9102 };
  const IDS = [LESSON.id, DRAFT.id];
  const path = (id: string = LESSON.id) => `/api/courses/fr/lessons/${id}/discussion`;
  const body = (message = 'Pourquoi « on se voit » ?') => ({
    attemptId: randomUUID(),
    message,
    history: [],
  });

  /** The events of an SSE body, in order, as { event, data }. Comments are left out. */
  const events = (text: string) =>
    text
      .split('\n\n')
      .filter((block) => block.startsWith('event: '))
      .map((block) => {
        const [event, data] = block.split('\n');
        return {
          event: event.slice('event: '.length),
          data: JSON.parse(data.slice('data: '.length)),
        };
      });

  const signUp = async (email: string) => {
    const fresh = request.agent(app.getHttpServer());
    await fresh
      .post('/api/auth/signup')
      .send({ email, displayName: `disc${stamp}${email.length}`, password: 'Correct-Horse-9' })
      .expect(201);
    return fresh;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    llm = app.get(LLM_PROVIDER);

    await prisma.lesson.deleteMany({ where: { id: { in: IDS } } });
    await prisma.lesson.createMany({
      data: [
        { ...LESSON, brief, ready: true },
        { ...DRAFT, brief, ready: false },
      ],
    });

    agent = await signUp(emails[0]);
    await agent.post('/api/courses').send({ lang: 'fr', dailyGoal: 30 }).expect(201);
    await agent.patch('/api/courses/fr/level').send({ level: 'A1' }).expect(200);
    unplaced = await signUp(emails[1]);
    await unplaced.post('/api/courses').send({ lang: 'fr', dailyGoal: 30 }).expect(201);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.lesson.deleteMany({ where: { id: { in: IDS } } });
    await app.close();
  });

  describe('before the stream opens', () => {
    it('refuses a request without a session', async () => {
      await request(app.getHttpServer()).post(path()).send(body()).expect(401);
    });

    it.each([
      ['no attemptId', { message: 'Hi', history: [] }],
      ['an attemptId that is not a uuid', { ...body(), attemptId: 'nope' }],
      ['an empty message', body('   ')],
      ['a message over 500 characters', body('a'.repeat(501))],
      ['11 earlier turns', { ...body(), history: Array(11).fill({ role: 'user', text: 'Hi' }) }],
      ['a turn with an unknown role', { ...body(), history: [{ role: 'system', text: 'Hi' }] }],
    ])('answers 400 request.invalid to %s', async (_, sent) => {
      const response = await agent.post(path()).send(sent).expect(400);

      expect(response.body.message).toContain('request.invalid');
    });

    it.each([
      ['an unknown lesson', 'fr-test-nowhere'],
      ['a lesson that is not ready', DRAFT.id],
      ['a lesson of another language', 'de-test-discussion'],
    ])('answers 404 lesson.notFound to %s', async (_, id) => {
      const response = await agent.post(path(id)).send(body()).expect(404);

      expect(response.body.message).toBe('lesson.notFound');
    });

    it('answers 404 course.notFound without a course in that language', async () => {
      const response = await agent
        .post(`/api/courses/de/lessons/${LESSON.id}/discussion`)
        .send(body())
        .expect(404);

      expect(response.body.message).toBe('course.notFound');
    });

    it('answers 409 course.notPlaced before placement', async () => {
      const response = await unplaced.post(path()).send(body()).expect(409);

      expect(response.body.message).toBe('course.notPlaced');
    });
  });

  describe('the stream', () => {
    it('sends the answer as delta events, then done', async () => {
      const response = await agent.post(path()).send(body()).expect(200);

      expect(response.headers['content-type']).toBe('text/event-stream; charset=utf-8');
      expect(response.headers['cache-control']).toBe('no-cache, no-transform');
      expect(events(response.text)).toEqual([
        ...FIXTURE_ANSWER.map((text) => ({ event: 'delta', data: { text } })),
        { event: 'done', data: {} },
      ]);
    });

    it('gives the LLM the lesson in its system prompt, and the earlier turns before the new message', async () => {
      const streamText = vi.spyOn(llm, 'streamText');
      const history = [
        { role: 'user', text: 'Salut' },
        { role: 'assistant', text: 'Bonjour !' },
      ];

      await agent
        .post(path())
        .send({ ...body('Et « avant » ?'), history })
        .expect(200);

      const [sent] = streamText.mock.calls[0];
      expect(sent.purpose).toBe('lesson-discussion');
      expect(sent.system).toContain('tutor of one French lesson, level A1');
      expect(sent.system).toContain('on se voit');
      expect(sent.messages).toEqual([...history, { role: 'user', text: 'Et « avant » ?' }]);
      expect(sent.maxOutputTokens).toBe(1000);
      streamText.mockRestore();
    });

    it('ends with an error event after the pieces already sent when the answer breaks midway', async () => {
      const response = await agent.post(path()).send(body(FIXTURE_FAILURES.midstream)).expect(200);

      expect(events(response.text)).toEqual([
        ...FIXTURE_ANSWER.slice(0, 2).map((text) => ({ event: 'delta', data: { text } })),
        { event: 'error', data: { code: 'unknown' } },
      ]);
    });

    it.each([FIXTURE_FAILURES.blocked, FIXTURE_FAILURES.timeout])(
      'sends only an error event when the LLM fails before any text (%s)',
      async (failure) => {
        const response = await agent.post(path()).send(body(failure)).expect(200);

        expect(events(response.text)).toEqual([{ event: 'error', data: { code: 'unknown' } }]);
      },
    );

    // Through a raw socket: supertest waits for the whole body, a learner closing the tab does not.
    it('cancels the LLM call when the learner leaves midway', async () => {
      const streamText = vi.spyOn(llm, 'streamText');
      const server = app.getHttpServer().listen(0);
      const { port } = server.address() as AddressInfo;
      // A session of its own for the raw request: log in again and keep the cookie.
      const login = await request(server)
        .post('/api/auth/login')
        .send({ email: emails[0], password: 'Correct-Horse-9' })
        .expect(200);
      const cookie = login.headers['set-cookie'];

      await new Promise<void>((resolve, reject) => {
        const outgoing = httpRequest(
          {
            port,
            path: path(),
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie },
          },
          (incoming) => {
            // The first piece is here: the learner closes the tab.
            incoming.once('data', () => {
              outgoing.destroy();
              resolve();
            });
          },
        );
        outgoing.on('error', () => undefined);
        outgoing.end(JSON.stringify(body()));
        setTimeout(() => reject(new Error('no first piece')), 5_000);
      });

      const { signal } = streamText.mock.calls[0][0];
      await vi.waitFor(() => expect(signal.aborted).toBe(true));
      server.close();
      streamText.mockRestore();
    });
  });
});
