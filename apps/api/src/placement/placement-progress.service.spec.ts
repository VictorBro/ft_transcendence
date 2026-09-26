import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExamSession } from './placement.schema';

import type { QuestionBank } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { NETWORK_GRACE_S, PlacementProgressService } from './placement-progress.service';

const EVAL_ID = 'd7c1e4a2-5d38-4f6b-9a02-1e7c8d3f5b64';

const mockQuestion: QuestionBank = {
  id: 'b7c1e4a2-5d38-4f6b-9a02-1e7c8d3f5b64',
  sourceId: 'de-gram-0001',
  lang: 'de',
  level: 'B1',
  topic: 'verbs_morphology',
  category: 'grammar',
  readText: null,
  question: 'Er ___ gestern ins Kino gegangen.',
  options: ['ist', 'hat', 'war', 'wird'],
  answer: 'ist',
  timeLimitS: 30,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    questionBank: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      ...((prismaOverrides.questionBank as Record<string, unknown>) ?? {}),
    },
    userSeenQuestion: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
      ...((prismaOverrides.userSeenQuestion as Record<string, unknown>) ?? {}),
    },
    userLevel: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      ...((prismaOverrides.userLevel as Record<string, unknown>) ?? {}),
    },
    user: {
      update: vi.fn().mockResolvedValue({}),
      ...((prismaOverrides.user as Record<string, unknown>) ?? {}),
    },
    $transaction: vi.fn().mockImplementation((args) => Promise.all(args)),
    ...prismaOverrides,
  };

  return {
    service: new PlacementProgressService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('PlacementProgressService', () => {
  let service: PlacementProgressService;
  let prisma: ReturnType<typeof createService>['prisma'];

  beforeEach(() => {
    const created = createService();
    service = created.service;
    prisma = created.prisma;
  });

  describe('getQuestion', () => {
    it('returns question when found', async () => {
      prisma.questionBank.findUnique.mockResolvedValue(mockQuestion);

      const result = await service.getQuestion(mockQuestion.id);
      expect(result).toEqual(mockQuestion);
      expect(prisma.questionBank.findUnique).toHaveBeenCalledWith({
        where: { id: mockQuestion.id },
      });
    });

    it('throws NotFoundException when question not found', async () => {
      prisma.questionBank.findUnique.mockResolvedValue(null);

      await expect(service.getQuestion('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateUserLevel', () => {
    it('updates user level and activeLang in transaction', async () => {
      await service.updateUserLevel('user-1', 'de', 2);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.userLevel.update).toHaveBeenCalledWith({
        where: {
          userId_lang: {
            userId: 'user-1',
            lang: 'de',
          },
        },
        data: {
          level: 'B1',
        },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { activeLang: 'de' },
      });
    });

    it('throws ConflictException when level is null', async () => {
      await expect(service.updateUserLevel('user-1', 'de', null)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('checkOnboardingCompleted', () => {
    it('returns true when userLevel exists for user and language', async () => {
      prisma.userLevel.findUnique.mockResolvedValue({ id: 'ul-1' });

      const result = await service.checkOnboardingCompleted('user-1', 'de');
      expect(result).toBe(true);
      expect(prisma.userLevel.findUnique).toHaveBeenCalledWith({
        where: {
          userId_lang: {
            userId: 'user-1',
            lang: 'de',
          },
        },
        select: { id: true },
      });
    });

    it('returns false when userLevel does not exist', async () => {
      prisma.userLevel.findUnique.mockResolvedValue(null);

      const result = await service.checkOnboardingCompleted('user-1', 'fr');
      expect(result).toBe(false);
      expect(prisma.userLevel.findUnique).toHaveBeenCalledWith({
        where: {
          userId_lang: {
            userId: 'user-1',
            lang: 'fr',
          },
        },
        select: { id: true },
      });
    });
  });

  describe('adjustSessionFromAnswer', () => {
    it('throws BadRequestException if answer is not null and not in question options', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 0,
        hi: 5,
        level: 2,
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        answers: [],
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };

      await expect(
        service.adjustSessionFromAnswer('invalid-choice', mockQuestion, session, 'user-1'),
      ).rejects.toThrow(new BadRequestException('placement.invalidChoice'));
    });

    it('increments category count on correct answer', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 0,
        hi: 5,
        level: 2,
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        answers: [],
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };

      await service.adjustSessionFromAnswer('ist', mockQuestion, session, 'user-1');
      expect(session.mistakesPerLevel).toBe(0);
      expect(session.askedPerCategory.grammar).toBe(1);
      expect(session.level).toBe(2);
    });

    it('drops level when mistakes reach 2', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 0,
        hi: 5,
        level: 2,
        mistakesPerLevel: 1,
        askedPerCategory: { grammar: 1, vocabulary: 0, reading: 0 },
        totalAnswered: 1,
        answers: [],
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };

      await service.adjustSessionFromAnswer('hat', mockQuestion, session, 'user-1');
      expect(session.mistakesPerLevel).toBe(0);
      expect(session.hi).toBe(2);
      expect(session.level).toBe(1);
      expect(session.askedPerCategory).toEqual({ grammar: 0, vocabulary: 0, reading: 0 });
    });

    it('advances level when level questions are completed', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 0,
        hi: 5,
        level: 2,
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 2, vocabulary: 2, reading: 1 },
        totalAnswered: 5,
        answers: [],
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };

      await service.adjustSessionFromAnswer('ist', mockQuestion, session, 'user-1');
      expect(session.mistakesPerLevel).toBe(0);
      expect(session.lo).toBe(3);
      expect(session.level).toBe(4);
      expect(session.askedPerCategory).toEqual({ grammar: 0, vocabulary: 0, reading: 0 });
    });

    it('ends exam with upper boundary level when completing questions at highest level (currIndex === hiIndex - 1)', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 5,
        hi: 6,
        level: 5,
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 2, vocabulary: 2, reading: 1 },
        totalAnswered: 17,
        answers: [],
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };

      await service.adjustSessionFromAnswer('ist', mockQuestion, session, 'user-1');
      expect(session.ended).toBe(true);
      expect(session.level).toBe(6);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.userLevel.update).toHaveBeenCalledWith({
        where: {
          userId_lang: {
            userId: 'user-1',
            lang: 'de',
          },
        },
        data: {
          level: 'C2',
        },
      });
    });

    it('ends exam with lower boundary level when failing at lowest level (currIndex === loIndex)', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 0,
        hi: 1,
        level: 0,
        mistakesPerLevel: 1,
        askedPerCategory: { grammar: 1, vocabulary: 0, reading: 0 },
        totalAnswered: 7,
        answers: [],
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };

      await service.adjustSessionFromAnswer('hat', mockQuestion, session, 'user-1');
      expect(session.ended).toBe(true);
      expect(session.level).toBe(0);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.userLevel.update).toHaveBeenCalledWith({
        where: {
          userId_lang: {
            userId: 'user-1',
            lang: 'de',
          },
        },
        data: {
          level: 'A1',
        },
      });
    });

    it('scores timeout (null answer) as a mistake', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 0,
        hi: 5,
        level: 2,
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        answers: [],
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };

      await service.adjustSessionFromAnswer(null, mockQuestion, session, 'user-1');
      expect(session.mistakesPerLevel).toBe(1);
      expect(session.askedPerCategory.grammar).toBe(1);
    });

    describe('all six levels reachable as terminal outcomes against adjustSessionFromAnswer', () => {
      it('reaches terminal outcome A1 on lower boundary failure', async () => {
        const session: ExamSession = {
          evalId: EVAL_ID,
          lang: 'de',
          lo: 0,
          hi: 1,
          level: 0,
          mistakesPerLevel: 1,
          askedPerCategory: { grammar: 1, vocabulary: 0, reading: 0 },
          totalAnswered: 7,
          answers: [],
          ended: false,
          currentQuestionId: mockQuestion.id,
          servedAt: new Date().toISOString(),
        };

        await service.adjustSessionFromAnswer('hat', mockQuestion, session, 'user-1');
        expect(session.ended).toBe(true);
        expect(session.level).toBe(0);
      });

      it('reaches terminal outcome A2 on passing A1 when hi is A2', async () => {
        const session: ExamSession = {
          evalId: EVAL_ID,
          lang: 'de',
          lo: 0,
          hi: 1,
          level: 0,
          mistakesPerLevel: 0,
          askedPerCategory: { grammar: 2, vocabulary: 2, reading: 1 },
          totalAnswered: 11,
          answers: [],
          ended: false,
          currentQuestionId: mockQuestion.id,
          servedAt: new Date().toISOString(),
        };

        await service.adjustSessionFromAnswer('ist', mockQuestion, session, 'user-1');
        expect(session.ended).toBe(true);
        expect(session.level).toBe(1);
      });

      it('reaches terminal outcome B1 on passing A2 when hi is B1', async () => {
        const session: ExamSession = {
          evalId: EVAL_ID,
          lang: 'de',
          lo: 0,
          hi: 2,
          level: 1,
          mistakesPerLevel: 0,
          askedPerCategory: { grammar: 2, vocabulary: 2, reading: 1 },
          totalAnswered: 7,
          answers: [],
          ended: false,
          currentQuestionId: mockQuestion.id,
          servedAt: new Date().toISOString(),
        };

        await service.adjustSessionFromAnswer('ist', mockQuestion, session, 'user-1');
        expect(session.ended).toBe(true);
        expect(session.level).toBe(2);
      });

      it('reaches terminal outcome B2 on failing B2 when lo is B2', async () => {
        const session: ExamSession = {
          evalId: EVAL_ID,
          lang: 'de',
          lo: 3,
          hi: 4,
          level: 3,
          mistakesPerLevel: 1,
          askedPerCategory: { grammar: 1, vocabulary: 0, reading: 0 },
          totalAnswered: 13,
          answers: [],
          ended: false,
          currentQuestionId: mockQuestion.id,
          servedAt: new Date().toISOString(),
        };

        await service.adjustSessionFromAnswer('hat', mockQuestion, session, 'user-1');
        expect(session.ended).toBe(true);
        expect(session.level).toBe(3);
      });

      it('reaches terminal outcome C1 on passing B2 when hi is C1', async () => {
        const session: ExamSession = {
          evalId: EVAL_ID,
          lang: 'de',
          lo: 3,
          hi: 4,
          level: 3,
          mistakesPerLevel: 0,
          askedPerCategory: { grammar: 2, vocabulary: 2, reading: 1 },
          totalAnswered: 17,
          answers: [],
          ended: false,
          currentQuestionId: mockQuestion.id,
          servedAt: new Date().toISOString(),
        };

        await service.adjustSessionFromAnswer('ist', mockQuestion, session, 'user-1');
        expect(session.ended).toBe(true);
        expect(session.level).toBe(4);
      });

      it('reaches terminal outcome C2 on failing C2 when lo is C2', async () => {
        const session: ExamSession = {
          evalId: EVAL_ID,
          lang: 'de',
          lo: 5,
          hi: 6,
          level: 5,
          mistakesPerLevel: 1,
          askedPerCategory: { grammar: 1, vocabulary: 0, reading: 0 },
          totalAnswered: 13,
          answers: [],
          ended: false,
          currentQuestionId: mockQuestion.id,
          servedAt: new Date().toISOString(),
        };

        await service.adjustSessionFromAnswer('hat', mockQuestion, session, 'user-1');
        expect(session.ended).toBe(true);
        expect(session.level).toBe(5);
      });
    });
  });

  describe('hasTimedOut', () => {
    it('returns true when elapsed exceeds time limit plus network grace', () => {
      const servedAt = new Date(
        Date.now() - (mockQuestion.timeLimitS + NETWORK_GRACE_S + 2) * 1000,
      ).toISOString();
      expect(service.hasTimedOut(mockQuestion, servedAt)).toBe(true);
    });

    it('returns false when elapsed exceeds time limit but is within network grace', () => {
      const servedAt = new Date(Date.now() - (mockQuestion.timeLimitS + 1) * 1000).toISOString();
      expect(service.hasTimedOut(mockQuestion, servedAt)).toBe(false);
    });

    it('returns false when elapsed is within time limit', () => {
      const servedAt = new Date().toISOString();
      expect(service.hasTimedOut(mockQuestion, servedAt)).toBe(false);
    });
  });

  describe('getResult', () => {
    it('returns undefined if session is not ended', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 0,
        hi: 5,
        level: 2,
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        answers: [],
        ended: false,
        currentQuestionId: null,
        servedAt: new Date().toISOString(),
      };

      const result = await service.getResult(session);
      expect(result).toBeUndefined();
    });

    it('returns PlacementResult with report when session is ended', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 0,
        hi: 5,
        level: 2,
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 2,
        answers: [
          { questionId: mockQuestion.id, choice: 'ist' },
          { questionId: '22222222-2222-4222-8222-222222222222', choice: null },
        ],
        ended: true,
        currentQuestionId: null,
        servedAt: new Date().toISOString(),
      };

      const q2 = {
        ...mockQuestion,
        id: '22222222-2222-4222-8222-222222222222',
        question: 'Second question?',
        answer: 'Haus',
        options: ['Haus', 'Baum', 'Auto', 'Zug'],
      };

      prisma.questionBank.findMany.mockResolvedValue([mockQuestion, q2]);

      const result = await service.getResult(session);
      expect(result).toBeDefined();
      expect(result?.targetLevel).toBe('B1');
      expect(result?.report).toHaveLength(2);
      expect(result?.report).toEqual([
        {
          questionId: mockQuestion.id,
          question: mockQuestion.question,
          options: mockQuestion.options,
          chosen: 'ist',
          correct: 'ist',
          wasCorrect: true,
        },
        {
          questionId: q2.id,
          question: q2.question,
          options: q2.options,
          chosen: null,
          correct: 'Haus',
          wasCorrect: false,
        },
      ]);
    });

    it('returns PlacementResult with targetLevel: null when session was aborted', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 0,
        hi: 5,
        level: null,
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 1,
        answers: [{ questionId: mockQuestion.id, choice: null }],
        ended: true,
        currentQuestionId: null,
        servedAt: new Date().toISOString(),
      };
      prisma.questionBank.findMany.mockResolvedValue([mockQuestion]);

      const result = await service.getResult(session);
      expect(result).toBeDefined();
      expect(result?.targetLevel).toBeNull();
      expect(result?.report).toHaveLength(1);
      expect(result?.report[0]).toEqual({
        questionId: mockQuestion.id,
        question: mockQuestion.question,
        options: mockQuestion.options,
        chosen: null,
        correct: 'ist',
        wasCorrect: false,
      });
    });
  });
});
