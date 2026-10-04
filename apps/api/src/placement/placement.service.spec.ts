import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { Level, PlacementQuestion, PlacementResult, SubmitAnswerInput } from '@ft/shared';

import {
  bankPrisma,
  examSession,
  fakeRedis,
  placementBank,
  wrongChoice,
} from '../../test/placement.fixtures';
import type { CoursesService } from '../courses/courses.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { QuestionStockService } from '../question-generation/question-stock.service';
import type { RedisService } from '../redis/redis.service';
import { NETWORK_GRACE_S, PlacementProgressService } from './placement-progress.service';
import { PlacementQuestionService } from './placement-question.service';
import { PlacementSessionService } from './placement-session.service';
import { PlacementService } from './placement.service';

const USER = 'u-1';
const RUN = `user:${USER}:eval`;
const LOCK = `user:${USER}:eval_lock`;
const inProgress = new ConflictException('placement.inProgress');
const onboardingIncomplete = new ConflictException('placement.onboardingIncomplete');
const invalidSession = new ConflictException('placement.invalidSession');
const notFound = new NotFoundException('placement.notFound');
const poolExhausted = new NotFoundException('placement.poolExhausted');

/**
 * The real services over an in-memory bank and Redis: only the course a
 * result is written to is stubbed, since CoursesService has its own spec.
 */
describe('PlacementService', () => {
  // French, so a language that falls back to the 'de' default shows. English
  // for a retake in another language.
  const bank = [...placementBank('fr'), ...placementBank('en')];
  let redis: ReturnType<typeof fakeRedis>;
  let sessions: PlacementSessionService;
  let courses: { listCoursesUser: Mock; setLevel: Mock };
  let service: PlacementService;

  const start = (lang: 'fr' | 'en' = 'fr') => service.startPlacement(USER, { lang });
  const answer = (question: PlacementQuestion, right: boolean) => {
    const row = bank.find((candidate) => candidate.id === question.questionId)!;
    return service.submitAnswer(USER, {
      questionId: row.id,
      choice: right ? row.answer : wrongChoice(row),
    });
  };
  const timeOut = (question: PlacementQuestion) =>
    service.submitAnswer(USER, { questionId: question.questionId, choice: null });
  // Six wrong answers end a run at A1, the shortest way to a result.
  const finish = async () => {
    let step: PlacementQuestion | PlacementResult = await start();
    while ('questionId' in step) step = await answer(step, false);
    return step;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    redis = fakeRedis();
    const prisma = bankPrisma(bank) as unknown as PrismaService;
    sessions = new PlacementSessionService(redis as unknown as RedisService);
    courses = {
      listCoursesUser: vi
        .fn()
        .mockResolvedValue({ courses: [{ lang: 'fr' }, { lang: 'en' }], activeLang: null }),
      setLevel: vi.fn(),
    };
    service = new PlacementService(
      sessions,
      new PlacementQuestionService(prisma, {
        restock: vi.fn(),
      } as unknown as QuestionStockService),
      new PlacementProgressService(prisma),
      courses as unknown as CoursesService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('startPlacement', () => {
    it('opens a run at B1 and serves its first question', async () => {
      const first = await start();

      expect(first).toMatchObject({
        lang: 'fr',
        level: 'B1',
        remainingS: 30,
        progress: { answered: 0, maxQuestionsRemaining: 18 },
      });
      await expect(sessions.loadExamSession(USER)).resolves.toMatchObject({
        level: 2,
        answers: [],
        currentQuestionId: first.questionId,
        currentOptions: first.options,
      });
    });

    it.each(['fr', 'en'] as const)(
      'refuses a %s run while one is live, and releases its lock',
      async (lang) => {
        const first = await start();

        await expect(start(lang)).rejects.toThrow(inProgress);
        await expect(service.getPlacement(USER)).resolves.toEqual(first);
        expect(redis.data.has(LOCK)).toBe(false);
      },
    );

    it.each(['fr', 'en'] as const)('replaces a finished run with a new %s one', async (lang) => {
      await finish();

      const retake = await start(lang);

      expect(retake).toMatchObject({ lang, level: 'B1', progress: { answered: 0 } });
      await expect(sessions.loadExamSession(USER)).resolves.toMatchObject({
        lang,
        ended: false,
        answers: [],
      });
      expect(redis.data.has(LOCK)).toBe(false);
    });

    it('keeps the finished run and its report when the retake has nothing to serve', async () => {
      const result = await finish();
      vi.spyOn(PlacementQuestionService.prototype, 'getNewQuestion').mockRejectedValue(
        poolExhausted,
      );

      await expect(start()).rejects.toThrow(poolExhausted);
      await expect(service.getPlacement(USER)).resolves.toEqual(result);
      expect(redis.data.has(LOCK)).toBe(false);
    });

    it('replaces a stored run that has no ended field', async () => {
      await sessions.saveExamSession(
        USER,
        examSession({ totalAnswered: 1, answers: [{ questionId: randomUUID(), choice: null }] }),
      );
      delete (redis.data.get(RUN) as Record<string, string>).ended;

      const first = await start();

      await expect(sessions.hasLiveSession(USER)).resolves.toBe(true);
      await expect(sessions.loadExamSession(USER)).resolves.toMatchObject({
        lang: 'fr',
        answers: [],
        currentQuestionId: first.questionId,
      });
    });

    it('refuses a language the user has no course in', async () => {
      courses.listCoursesUser.mockResolvedValue({ courses: [{ lang: 'de' }], activeLang: 'de' });

      await expect(start()).rejects.toThrow(onboardingIncomplete);
      expect(redis.data.has(LOCK)).toBe(false);
    });

    it('refuses a retake in a language the user has no course in, and keeps the finished run', async () => {
      const result = await finish();
      courses.listCoursesUser.mockResolvedValue({ courses: [{ lang: 'fr' }], activeLang: 'fr' });

      await expect(start('en')).rejects.toThrow(onboardingIncomplete);
      await expect(service.getPlacement(USER)).resolves.toEqual(result);
    });

    it('refuses to start while another request holds the lock', async () => {
      await redis.client.set(LOCK, 'other');

      await expect(start()).rejects.toThrow(inProgress);
      expect(redis.data.get(LOCK)).toBe('other');
    });
  });

  it('throws placement.notFound without a run, or with a stored run that serves nothing', async () => {
    const orphan: SubmitAnswerInput = { questionId: randomUUID(), choice: null };
    await expect(service.getPlacement(USER)).rejects.toThrow(notFound);
    await expect(service.submitAnswer(USER, orphan)).rejects.toThrow(notFound);

    await sessions.saveExamSession(USER, examSession());
    await expect(service.getPlacement(USER)).rejects.toThrow(notFound);
    await expect(service.submitAnswer(USER, orphan)).rejects.toThrow(notFound);
    expect(redis.data.has(LOCK)).toBe(false);
  });

  it('refuses to show or answer a finished run stored without a level, until a start replaces it', async () => {
    await sessions.saveExamSession(
      USER,
      examSession({ ended: true, level: null, currentQuestionId: randomUUID() }),
    );

    await expect(service.getPlacement(USER)).rejects.toThrow(invalidSession);
    await expect(
      service.submitAnswer(USER, { questionId: randomUUID(), choice: null }),
    ).rejects.toThrow(invalidSession);
    expect(redis.data.has(LOCK)).toBe(false);
    await expect(start()).resolves.toMatchObject({ lang: 'fr', level: 'B1' });
  });

  it('serves the same question on reload, with the clock running down to zero', async () => {
    const first = await start();
    vi.advanceTimersByTime(10_000);
    await expect(service.getPlacement(USER)).resolves.toEqual({ ...first, remainingS: 20 });

    // A GET never scores the timeout, so even past the grace it shows no time left.
    vi.advanceTimersByTime((first.timeLimitS + NETWORK_GRACE_S) * 1000);
    await expect(service.getPlacement(USER)).resolves.toEqual({ ...first, remainingS: 0 });
  });

  it('drops the run when the bank runs dry mid-run, so the learner can start again', async () => {
    const first = await start();
    vi.spyOn(PlacementQuestionService.prototype, 'getNewPlacementQuestion').mockRejectedValue(
      poolExhausted,
    );

    await expect(answer(first, true)).rejects.toThrow(poolExhausted);
    await expect(sessions.loadExamSession(USER)).resolves.toBeNull();
    expect(redis.data.has(LOCK)).toBe(false);
  });

  describe('submitAnswer', () => {
    it('records the answer and serves the next question before it lets go of the lock', async () => {
      const first = await start();
      const save = vi.spyOn(sessions, 'saveExamSession');
      const release = vi.spyOn(sessions, 'releaseLock');

      const next = await answer(first, true);

      expect(next).toMatchObject({ progress: { answered: 1 } });
      expect(next).not.toMatchObject({ questionId: first.questionId });
      await expect(sessions.loadExamSession(USER)).resolves.toMatchObject({
        answers: [{ questionId: first.questionId, choice: expect.any(String) }],
      });
      expect(save).toHaveBeenCalledBefore(release);
    });

    it('scores an answer that arrives after timeLimitS plus grace as a timeout, even a right one', async () => {
      const first = await start();
      vi.advanceTimersByTime((first.timeLimitS + NETWORK_GRACE_S) * 1000);

      await expect(answer(first, true)).resolves.toMatchObject({ progress: { answered: 1 } });
      await expect(sessions.loadExamSession(USER)).resolves.toMatchObject({
        mistakesPerLevel: 1,
        answers: [{ questionId: first.questionId, choice: null }],
      });
    });

    it.each([
      [
        'a choice outside the options',
        (first: PlacementQuestion) => ({ questionId: first.questionId, choice: 'nope' }),
        new BadRequestException('placement.invalidChoice'),
      ],
      [
        'an answer to another question',
        (first: PlacementQuestion) => ({ questionId: randomUUID(), choice: first.options[0] }),
        new ConflictException('placement.questionMismatch'),
      ],
    ])('rejects %s and leaves the run as it was', async (_, dto, error) => {
      const first = await start();

      await expect(service.submitAnswer(USER, dto(first))).rejects.toThrow(error);
      await expect(service.getPlacement(USER)).resolves.toEqual(first);
      expect(redis.data.has(LOCK)).toBe(false);
    });

    it('rejects a stored run that already holds an answer to its current question', async () => {
      const row = bank[0];
      await sessions.saveExamSession(
        USER,
        examSession({
          totalAnswered: 1,
          answers: [{ questionId: row.id, choice: row.answer }],
          currentQuestionId: row.id,
          currentOptions: row.options,
        }),
      );

      await expect(
        service.submitAnswer(USER, { questionId: row.id, choice: row.answer }),
      ).rejects.toThrow(invalidSession);
    });
  });

  it('refuses to answer or quit while another request holds the lock', async () => {
    const first = await start();
    await redis.client.set(LOCK, 'other');

    const answering = expect(answer(first, true)).rejects.toThrow(inProgress);
    const quitting = expect(service.quitPlacement(USER)).rejects.toThrow(inProgress);
    await vi.runAllTimersAsync();
    await Promise.all([answering, quitting]);

    await expect(service.getPlacement(USER)).resolves.toEqual(first);
    expect(redis.data.get(LOCK)).toBe('other');
  });

  describe('quitPlacement', () => {
    it('deletes the run', async () => {
      await start();

      await service.quitPlacement(USER);

      await expect(service.getPlacement(USER)).rejects.toThrow(notFound);
      expect(redis.data.has(LOCK)).toBe(false);
    });

    it('releases the lock when the delete fails', async () => {
      vi.spyOn(redis.client, 'del').mockRejectedValueOnce(new Error('redis down'));

      await expect(service.quitPlacement(USER)).rejects.toThrow('redis down');
      expect(redis.data.has(LOCK)).toBe(false);
    });
  });

  // A learner who walks away from an open run times out on every question.
  it('ends a run where every answer timed out without touching the course', async () => {
    let step: PlacementQuestion | PlacementResult = await start();
    while ('questionId' in step) step = await timeOut(step);

    expect(step).toMatchObject({ lang: 'fr', targetLevel: 'A1', applied: false });
    expect(step.report.map((entry) => entry.chosen)).toEqual(Array(6).fill(null));
    expect(courses.setLevel).not.toHaveBeenCalled();
    await expect(service.getPlacement(USER)).resolves.toEqual(step);
  });

  it('places the course after a run with a single real answer, even a wrong one', async () => {
    let step: PlacementQuestion | PlacementResult = await answer(await start(), false);
    while ('questionId' in step) step = await timeOut(step);

    expect(step).toMatchObject({ lang: 'fr', targetLevel: 'A1', applied: true });
    expect(courses.setLevel).toHaveBeenCalledExactlyOnceWith(USER, 'fr', { level: 'A1' });
    await expect(service.getPlacement(USER)).resolves.toEqual(step);
  });

  // One row per result the exam can give. A level takes six right answers to
  // pass and a second mistake to fail it, which fixes the answer count.
  it.each([
    ['B1 pass, C1 pass', 12, 'C2'],
    ['B1 pass, C1 fail, B2 pass', 14, 'C1'],
    ['B1 pass, C1 fail, B2 fail', 10, 'B2'],
    ['B1 fail, A2 pass', 8, 'B1'],
    ['B1 fail, A2 fail, A1 pass', 10, 'A2'],
    ['B1 fail, A2 fail, A1 fail', 6, 'A1'],
  ])('%s: %i answers, placed at %s', async (path, answered, target) => {
    const steps = path.split(', ');
    const levels: Level[] = [];
    let step: PlacementQuestion | PlacementResult = await start();
    while ('questionId' in step) {
      levels.push(step.level);
      step = await answer(step, steps.includes(`${step.level} pass`));
    }

    expect(levels.filter((level, i) => level !== levels[i - 1])).toEqual(
      steps.map((visit) => visit.slice(0, 2)),
    );
    expect(levels).toHaveLength(answered);
    expect(step).toEqual({
      lang: 'fr',
      targetLevel: target,
      applied: true,
      report: expect.any(Array),
    });
    expect(step.report.map((entry) => entry.level)).toEqual(levels);
    expect(courses.setLevel).toHaveBeenCalledExactlyOnceWith(USER, 'fr', { level: target });
    await expect(service.getPlacement(USER)).resolves.toEqual(step);
    await expect(
      service.submitAnswer(USER, { questionId: randomUUID(), choice: null }),
    ).resolves.toEqual(step);
  });
});
