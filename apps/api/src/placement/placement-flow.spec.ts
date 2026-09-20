import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type Level,
  type PlacementQuestion,
  type PlacementResult,
  type QuestionCategory,
  type TargetLevel,
} from '@ft/shared';

import type { QuestionBank } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { NETWORK_GRACE_S, PlacementProgressService } from './placement-progress.service';
import { PlacementQuestionService } from './placement-question.service';
import { PlacementSessionService } from './placement-session.service';
import { PlacementService } from './placement.service';

function createMockQuestionBank(): QuestionBank[] {
  const categories: QuestionCategory[] = ['grammar', 'vocabulary', 'reading'];
  const levels: Level[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const questions: QuestionBank[] = [];

  for (const level of levels) {
    for (const cat of categories) {
      for (let i = 1; i <= 10; i++) {
        const id = randomUUID();
        questions.push({
          id,
          sourceId: `src-${level}-${cat}-${i}`,
          lang: 'de',
          level,
          topic: 'verbs_morphology',
          category: cat,
          readText: null,
          readText: cat === 'reading' ? `Read text for ${level} ${cat} ${i}` : null,
          question: `Question ${level} ${cat} ${i}`,
          options: [`correct_${level}_${cat}_${i}`, 'option_b', 'option_c', 'option_d'],
          answer: `correct_${level}_${cat}_${i}`,
          timeLimitS: 30,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
  }
  return questions;
}

function setupPlacementEnvironment() {
  const questionBank = createMockQuestionBank();
  const questionMap = new Map(questionBank.map((q) => [q.id, q]));
  const userSeen = new Set<string>();

  const prisma = {
    questionBank: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return questionMap.get(where.id) ?? null;
      }),
      findMany: vi.fn(
        async ({
          where,
          take,
        }: {
          where: {
            lang?: string;
            level?: Level;
            category?: QuestionCategory | { in: QuestionCategory[] };
            id?: { in: string[] };
            userSeenQuestions?: { none?: { userId?: string } };
          };
          take?: number;
        }) => {
          let filtered = questionBank.filter((q) => {
            if (where.lang && q.lang !== where.lang) return false;
            if (where.level && q.level !== where.level) return false;
            if (where.category) {
              if (typeof where.category === 'string') {
                if (q.category !== where.category) return false;
              } else if (where.category.in && !where.category.in.includes(q.category)) {
                return false;
              }
            }
            if (where.id?.in && !where.id.in.includes(q.id)) return false;
            if (where.userSeenQuestions?.none?.userId) {
              const key = `${where.userSeenQuestions.none.userId}:${q.id}`;
              if (userSeen.has(key)) return false;
            }
            return true;
          });
          if (take !== undefined) {
            filtered = filtered.slice(0, take);
          }
          return filtered;
        },
      ),
    },
    userSeenQuestion: {
      findMany: vi.fn(async () => []),
      upsert: vi.fn(
        async ({
          where,
        }: {
          where: { userId_questionId: { userId: string; questionId: string } };
        }) => {
          userSeen.add(`${where.userId_questionId.userId}:${where.userId_questionId.questionId}`);
          return {};
        },
      ),
    },
    userLevel: {
      findUnique: vi.fn(async () => ({ id: 'ul-1' })),
      update: vi.fn(async () => ({})),
    },
    user: {
      update: vi.fn(async () => ({})),
    },
    $transaction: vi.fn(async (args: Promise<unknown>[]) => Promise.all(args)),
  };

  const redisStore = new Map<string, Record<string, string>>();
  const redisLists = new Map<string, string[]>();

  const redis = {
    client: {
      exists: vi.fn(async (key: string) => (redisStore.has(key) ? 1 : 0)),
      hSet: vi.fn(async (key: string, data: Record<string, string>) => {
        const existing = redisStore.get(key) ?? {};
        redisStore.set(key, { ...existing, ...data });
        return 1;
      }),
      hGetAll: vi.fn(async (key: string) => redisStore.get(key) ?? {}),
      rPush: vi.fn(async (key: string, val: string) => {
        const list = redisLists.get(key) ?? [];
        list.push(val);
        redisLists.set(key, list);
        return list.length;
      }),
      lRange: vi.fn(async (key: string, start: number, stop: number) => {
        const list = redisLists.get(key) ?? [];
        if (stop === -1) return list.slice(start);
        return list.slice(start, stop + 1);
      }),
      del: vi.fn(async (keys: string[]) => {
        for (const k of keys) {
          redisStore.delete(k);
          redisLists.delete(k);
        }
        return keys.length;
      }),
      expire: vi.fn(async () => 1),
    },
  };

  const sessionService = new PlacementSessionService(redis as unknown as RedisService);
  const questionService = new PlacementQuestionService(
    prisma as unknown as PrismaService,
    sessionService,
  );
  const progressService = new PlacementProgressService(
    prisma as unknown as PrismaService,
    sessionService,
  );
  const service = new PlacementService(sessionService, questionService, progressService);

  return {
    service,
    prisma,
    redis,
    questionMap,
  };
}

describe('Placement Exam Scenarios', () => {
  let env: ReturnType<typeof setupPlacementEnvironment>;

  beforeEach(() => {
    vi.useFakeTimers();
    env = setupPlacementEnvironment();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. user starts test, let each question time out and submit random answer after timeout. result: user goes B1 -> A2 -> A1 (6 wrong answers), test ends with target level A1', async () => {
    const userId = 'user-scenario-1';
    let currentResponse: PlacementQuestion | PlacementResult = await env.service.startPlacement(
      userId,
      { lang: 'de' },
    );

    expect('questionId' in currentResponse).toBe(true);
    let question = currentResponse as PlacementQuestion;
    expect(question.level).toBe('B1');

    const observedLevels: Level[] = [];
    let answersSubmitted = 0;

    while ('questionId' in currentResponse) {
      question = currentResponse as PlacementQuestion;
      observedLevels.push(question.level);
      answersSubmitted += 1;

      // Question times out: advance past timeLimitS + NETWORK_GRACE_S
      vi.advanceTimersByTime((question.timeLimitS + NETWORK_GRACE_S + 2) * 1000);

      // Submit random answer after timeout
      currentResponse = await env.service.submitAnswer(userId, {
        questionId: question.questionId,
        choice: 'random_answer_after_timeout',
      });
    }

    expect(answersSubmitted).toBe(6);
    expect(observedLevels).toEqual(['B1', 'B1', 'A2', 'A2', 'A1', 'A1']);
    expect('targetLevel' in currentResponse).toBe(true);

    const result = currentResponse as PlacementResult;
    expect(result.targetLevel).toBe('A1');
    expect(result.report).toHaveLength(6);
    expect(result.report.every((entry) => !entry.wasCorrect)).toBe(true);
    expect(result.report.every((entry) => entry.chosen === null)).toBe(true);

    expect(env.prisma.userLevel.update).toHaveBeenCalledWith({
      where: {
        userId_lang: {
          userId,
          lang: 'de',
        },
      },
      data: {
        level: 'A1',
      },
    });
  });

  it('user fails B1 and A2, but succeeds on A1: test ends with target level A2', async () => {
    const userId = 'user-scenario-fail-a2-succeed-a1';
    let currentResponse: PlacementQuestion | PlacementResult = await env.service.startPlacement(
      userId,
      { lang: 'de' },
    );

    const observedLevels: Level[] = [];
    let answersSubmitted = 0;

    while ('questionId' in currentResponse) {
      const question = currentResponse as PlacementQuestion;
      observedLevels.push(question.level);
      answersSubmitted += 1;

      const qBankItem = env.questionMap.get(question.questionId);
      expect(qBankItem).toBeDefined();

      // At B1 and A2: answer incorrectly to fail down to A1
      // At A1: answer correctly to succeed A1
      const isA1 = question.level === 'A1';
      const choice = isA1 ? qBankItem!.answer : 'wrong_choice';

      currentResponse = await env.service.submitAnswer(userId, {
        questionId: question.questionId,
        choice,
      });
    }

    // 2 wrong at B1, 2 wrong at A2, 6 correct at A1 = 10 total
    expect(answersSubmitted).toBe(10);
    expect(observedLevels.slice(0, 2)).toEqual(['B1', 'B1']);
    expect(observedLevels.slice(2, 4)).toEqual(['A2', 'A2']);
    expect(observedLevels.slice(4, 10)).toEqual(['A1', 'A1', 'A1', 'A1', 'A1', 'A1']);

    expect('targetLevel' in currentResponse).toBe(true);
    const result = currentResponse as PlacementResult;
    expect(result.targetLevel).toBe('A2');
    expect(result.report).toHaveLength(10);

    expect(env.prisma.userLevel.update).toHaveBeenCalledWith({
      where: {
        userId_lang: {
          userId,
          lang: 'de',
        },
      },
      data: {
        level: 'A2',
      },
    });
  });

  it('2. user starts test, will answer each question correctly. he will go through levels B1, C1, C2 with final result C3', async () => {
    const userId = 'user-scenario-2';
    let currentResponse: PlacementQuestion | PlacementResult = await env.service.startPlacement(
      userId,
      { lang: 'de' },
    );

    const observedLevels: Level[] = [];
    let answersSubmitted = 0;

    while ('questionId' in currentResponse) {
      const question = currentResponse as PlacementQuestion;
      observedLevels.push(question.level);
      answersSubmitted += 1;

      const qBankItem = env.questionMap.get(question.questionId);
      expect(qBankItem).toBeDefined();

      currentResponse = await env.service.submitAnswer(userId, {
        questionId: question.questionId,
        choice: qBankItem!.answer,
      });
    }

    expect(answersSubmitted).toBe(18);

    // Verify progression through levels B1, C1, C2 (6 questions each)
    expect(observedLevels.slice(0, 6)).toEqual(['B1', 'B1', 'B1', 'B1', 'B1', 'B1']);
    expect(observedLevels.slice(6, 12)).toEqual(['C1', 'C1', 'C1', 'C1', 'C1', 'C1']);
    expect(observedLevels.slice(12, 18)).toEqual(['C2', 'C2', 'C2', 'C2', 'C2', 'C2']);

    expect('targetLevel' in currentResponse).toBe(true);
    const result = currentResponse as PlacementResult;
    expect(result.targetLevel).toBe('C3');
    expect(result.report).toHaveLength(18);
    expect(result.report.every((entry) => entry.wasCorrect)).toBe(true);

    expect(env.prisma.userLevel.update).toHaveBeenCalledWith({
      where: {
        userId_lang: {
          userId,
          lang: 'de',
        },
      },
      data: {
        level: 'C3',
      },
    });
  });

  it('3. user starts test, on each level will make mistake on random question out of 6, he will reach C3', async () => {
    const userId = 'user-scenario-3';
    let currentResponse: PlacementQuestion | PlacementResult = await env.service.startPlacement(
      userId,
      { lang: 'de' },
    );

    const observedLevels: Level[] = [];
    let answersSubmitted = 0;

    // Pick random mistake index (0 to 5) for each of the 3 levels
    const mistakeIndicesPerLevel = [
      Math.floor(Math.random() * 6),
      Math.floor(Math.random() * 6),
      Math.floor(Math.random() * 6),
    ];

    while ('questionId' in currentResponse) {
      const question = currentResponse as PlacementQuestion;
      observedLevels.push(question.level);

      const levelIndex = Math.floor(answersSubmitted / 6);
      const questionIndexInLevel = answersSubmitted % 6;
      const isMistake = questionIndexInLevel === mistakeIndicesPerLevel[levelIndex];

      answersSubmitted += 1;

      const qBankItem = env.questionMap.get(question.questionId);
      expect(qBankItem).toBeDefined();

      const choice = isMistake ? 'intentionally_wrong_answer' : qBankItem!.answer;

      currentResponse = await env.service.submitAnswer(userId, {
        questionId: question.questionId,
        choice,
      });
    }

    expect(answersSubmitted).toBe(18);

    // Verify progression through levels B1, C1, C2
    expect(observedLevels.slice(0, 6)).toEqual(['B1', 'B1', 'B1', 'B1', 'B1', 'B1']);
    expect(observedLevels.slice(6, 12)).toEqual(['C1', 'C1', 'C1', 'C1', 'C1', 'C1']);
    expect(observedLevels.slice(12, 18)).toEqual(['C2', 'C2', 'C2', 'C2', 'C2', 'C2']);

    expect('targetLevel' in currentResponse).toBe(true);
    const result = currentResponse as PlacementResult;
    expect(result.targetLevel).toBe('C3');
    expect(result.report).toHaveLength(18);

    const wrongAnswers = result.report.filter((entry) => !entry.wasCorrect);
    const correctAnswers = result.report.filter((entry) => entry.wasCorrect);
    expect(wrongAnswers).toHaveLength(3);
    expect(correctAnswers).toHaveLength(15);

    expect(env.prisma.userLevel.update).toHaveBeenCalledWith({
      where: {
        userId_lang: {
          userId,
          lang: 'de',
        },
      },
      data: {
        level: 'C3',
      },
    });
  });

  describe('All Possible Binary Search Level Paths', () => {
    async function runPath(userId: string, decisions: Partial<Record<Level, 'up' | 'down'>>) {
      let currentResponse: PlacementQuestion | PlacementResult = await env.service.startPlacement(
        userId,
        { lang: 'de' },
      );

      const uniqueLevelsTested: Level[] = [];
      const questionsPerLevel: Record<string, number> = {};

      while ('questionId' in currentResponse) {
        const question = currentResponse as PlacementQuestion;
        if (uniqueLevelsTested[uniqueLevelsTested.length - 1] !== question.level) {
          uniqueLevelsTested.push(question.level);
        }
        questionsPerLevel[question.level] = (questionsPerLevel[question.level] ?? 0) + 1;

        const decision = decisions[question.level] ?? 'up';
        const qBankItem = env.questionMap.get(question.questionId);
        expect(qBankItem).toBeDefined();

        const choice = decision === 'up' ? qBankItem!.answer : 'wrong_choice';

        currentResponse = await env.service.submitAnswer(userId, {
          questionId: question.questionId,
          choice,
        });
      }

      return {
        uniqueLevelsTested,
        questionsPerLevel,
        result: currentResponse as PlacementResult,
      };
    }

    it.each([
      {
        name: 'B1 (up) -> C1 (up) -> C2 (up) => ends at C3',
        decisions: { B1: 'up', C1: 'up', C2: 'up' } as Partial<Record<Level, 'up' | 'down'>>,
        expectedLevels: ['B1', 'C1', 'C2'] as Level[],
        expectedTargetLevel: 'C3' as TargetLevel,
      },
      {
        name: 'B1 (up) -> C1 (up) -> C2 (down) => ends at C2',
        decisions: { B1: 'up', C1: 'up', C2: 'down' } as Partial<Record<Level, 'up' | 'down'>>,
        expectedLevels: ['B1', 'C1', 'C2'] as Level[],
        expectedTargetLevel: 'C2' as TargetLevel,
      },
      {
        name: 'B1 (up) -> C1 (down) -> B2 (up) => ends at C1',
        decisions: { B1: 'up', C1: 'down', B2: 'up' } as Partial<Record<Level, 'up' | 'down'>>,
        expectedLevels: ['B1', 'C1', 'B2'] as Level[],
        expectedTargetLevel: 'C1' as TargetLevel,
      },
      {
        name: 'B1 (up) -> C1 (down) -> B2 (down) => ends at B2',
        decisions: { B1: 'up', C1: 'down', B2: 'down' } as Partial<Record<Level, 'up' | 'down'>>,
        expectedLevels: ['B1', 'C1', 'B2'] as Level[],
        expectedTargetLevel: 'B2' as TargetLevel,
      },
      {
        name: 'B1 (down) -> A2 (up) => ends at B1',
        decisions: { B1: 'down', A2: 'up' } as Partial<Record<Level, 'up' | 'down'>>,
        expectedLevels: ['B1', 'A2'] as Level[],
        expectedTargetLevel: 'B1' as TargetLevel,
      },
      {
        name: 'B1 (down) -> A2 (down) -> A1 (up) => ends at A2',
        decisions: { B1: 'down', A2: 'down', A1: 'up' } as Partial<Record<Level, 'up' | 'down'>>,
        expectedLevels: ['B1', 'A2', 'A1'] as Level[],
        expectedTargetLevel: 'A2' as TargetLevel,
      },
      {
        name: 'B1 (down) -> A2 (down) -> A1 (down) => ends at A1',
        decisions: { B1: 'down', A2: 'down', A1: 'down' } as Partial<Record<Level, 'up' | 'down'>>,
        expectedLevels: ['B1', 'A2', 'A1'] as Level[],
        expectedTargetLevel: 'A1' as TargetLevel,
      },
    ])('$name', async ({ decisions, expectedLevels, expectedTargetLevel }) => {
      const userId = `path-${expectedLevels.join('-')}-${expectedTargetLevel}`;
      const { uniqueLevelsTested, result } = await runPath(userId, decisions);

      // Verify no level is tested twice on the path
      expect(new Set(uniqueLevelsTested).size).toBe(uniqueLevelsTested.length);

      // Verify the exact level progression path
      expect(uniqueLevelsTested).toEqual(expectedLevels);

      // Verify final target level
      expect(result.targetLevel).toBe(expectedTargetLevel);

      // Verify database update
      expect(env.prisma.userLevel.update).toHaveBeenCalledWith({
        where: {
          userId_lang: {
            userId,
            lang: 'de',
          },
        },
        data: {
          level: expectedTargetLevel,
        },
      });
    });
  });

  describe('Specific Acceptance Criteria', () => {
    it('an answer arriving after timeLimitS plus grace is scored late even when the request claims the correct answer (with faked clock)', async () => {
      const userId = 'user-timeout-correct-claimed';
      const firstQuestion = (await env.service.startPlacement(userId, {
        lang: 'de',
      })) as PlacementQuestion;

      const qBankItem = env.questionMap.get(firstQuestion.questionId)!;

      // Advance clock past timeLimitS + NETWORK_GRACE_S
      vi.advanceTimersByTime((firstQuestion.timeLimitS + NETWORK_GRACE_S + 2) * 1000);

      // Client submits the correct choice, but arrived late
      await env.service.submitAnswer(userId, {
        questionId: firstQuestion.questionId,
        choice: qBankItem.answer,
      });

      // The answer was scored late and saved as choice: null
      const answers = await env.redis.client.lRange(`user:${userId}:eval_questions`, 0, -1);
      expect(answers).toHaveLength(1);
      const recorded = JSON.parse(answers[0]);
      expect(recorded.choice).toBeNull();

      // Session mistakesPerLevel is incremented as a mistake
      const sessionData = await env.redis.client.hGetAll(`user:${userId}:eval`);
      expect(sessionData.mistakesPerLevel).toBe('1');
    });

    it('refreshing does not reset remainingS', async () => {
      const userId = 'user-refresh-timer';
      const initialQuestion = (await env.service.startPlacement(userId, {
        lang: 'de',
      })) as PlacementQuestion;

      expect(initialQuestion.remainingS).toBe(initialQuestion.timeLimitS);

      // Advance clock by 10s and reload/refresh (call getPlacement)
      vi.advanceTimersByTime(10_000);

      const refreshed1 = (await env.service.getPlacement(userId)) as PlacementQuestion;
      expect(refreshed1.questionId).toBe(initialQuestion.questionId);
      expect(refreshed1.remainingS).toBe(initialQuestion.timeLimitS - 10);

      // Advance clock by another 5s and reload again
      vi.advanceTimersByTime(5_000);

      const refreshed2 = (await env.service.getPlacement(userId)) as PlacementQuestion;
      expect(refreshed2.questionId).toBe(initialQuestion.questionId);
      expect(refreshed2.remainingS).toBe(initialQuestion.timeLimitS - 15);
    });

    it('no response ever contains the correct answer for the question being asked', async () => {
      const userId = 'user-no-answer-leak';
      const firstQuestion = (await env.service.startPlacement(userId, {
        lang: 'de',
      })) as PlacementQuestion;

      expect((firstQuestion as Record<string, unknown>).answer).toBeUndefined();

      const fetchedQuestion = (await env.service.getPlacement(userId)) as PlacementQuestion;
      expect((fetchedQuestion as Record<string, unknown>).answer).toBeUndefined();

      const qBankItem = env.questionMap.get(firstQuestion.questionId)!;
      const nextQuestion = (await env.service.submitAnswer(userId, {
        questionId: firstQuestion.questionId,
        choice: qBankItem.answer,
      })) as PlacementQuestion;

      expect((nextQuestion as Record<string, unknown>).answer).toBeUndefined();
    });

    it('a second POST while a run is live returns 409 (ConflictException)', async () => {
      const userId = 'user-second-post-live';
      await env.service.startPlacement(userId, { lang: 'de' });

      await expect(env.service.startPlacement(userId, { lang: 'de' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('a served question is in UserSeenQuestion before its answer arrives', async () => {
      const userId = 'user-seen-before-answer';
      const firstQuestion = (await env.service.startPlacement(userId, {
        lang: 'de',
      })) as PlacementQuestion;

      // Verify question is already in userSeenQuestion before submitting answer
      expect(env.prisma.userSeenQuestion.upsert).toHaveBeenCalledWith({
        where: {
          userId_questionId: {
            userId,
            questionId: firstQuestion.questionId,
          },
        },
        create: {
          userId,
          questionId: firstQuestion.questionId,
        },
        update: {
          updatedAt: expect.any(Date),
        },
      });

      const upsertCallsBeforeAnswer = vi.mocked(env.prisma.userSeenQuestion.upsert).mock.calls
        .length;

      // Submit answer for the first question -> next question is served
      const nextQuestion = (await env.service.submitAnswer(userId, {
        questionId: firstQuestion.questionId,
        choice: 'any_choice',
      })) as PlacementQuestion;

      // The next question is also already in userSeenQuestion before its answer arrives
      expect(vi.mocked(env.prisma.userSeenQuestion.upsert).mock.calls.length).toBeGreaterThan(
        upsertCallsBeforeAnswer,
      );
      expect(env.prisma.userSeenQuestion.upsert).toHaveBeenCalledWith({
        where: {
          userId_questionId: {
            userId,
            questionId: nextQuestion.questionId,
          },
        },
        create: {
          userId,
          questionId: nextQuestion.questionId,
        },
        update: {
          updatedAt: expect.any(Date),
        },
      });
    });
  });
});
