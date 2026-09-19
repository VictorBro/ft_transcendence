import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExamSession, PlacementQuestion, PlacementResult } from '@ft/shared';

import type { QuestionBank } from '../generated/prisma/client';
import { PlacementSessionService } from './placement-session.service';
import { PlacementQuestionService } from './placement-question.service';
import { PlacementProgressService } from './placement-progress.service';
import { PlacementService } from './placement.service';

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

const mockPlacementQuestion: PlacementQuestion = {
  questionId: mockQuestion.id,
  category: 'grammar',
  level: 'B1',
  question: mockQuestion.question,
  options: mockQuestion.options,
  timeLimitS: 30,
  remainingS: 30,
  progress: {
    answered: 0,
    maxRemaining: 18,
  },
};

const mockPlacementResult: PlacementResult = {
  targetLevel: 'B1',
  report: [],
};

function createPlacementService() {
  const sessionService = {
    hasActiveSession: vi.fn().mockResolvedValue(false),
    saveExamSession: vi.fn().mockResolvedValue(undefined),
    loadExamSession: vi.fn().mockResolvedValue(null),
    archiveQuestionAnswer: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined),
  } as unknown as PlacementSessionService;

  const questionService = {
    getNewPlacementQuestion: vi.fn().mockResolvedValue(mockPlacementQuestion),
    createPlacementQuestion: vi.fn().mockReturnValue(mockPlacementQuestion),
  } as unknown as PlacementQuestionService;

  const progressService = {
    getQuestion: vi.fn().mockResolvedValue(mockQuestion),
    hasTimedOut: vi.fn().mockReturnValue(false),
    adjustSessionFromAnswer: vi.fn().mockResolvedValue(undefined),
    getResult: vi.fn().mockResolvedValue(undefined),
  } as unknown as PlacementProgressService;

  const service = new PlacementService(sessionService, questionService, progressService);

  return {
    service,
    sessionService,
    questionService,
    progressService,
  };
}

describe('PlacementService', () => {
  let service: PlacementService;
  let sessionService: ReturnType<typeof createPlacementService>['sessionService'];
  let questionService: ReturnType<typeof createPlacementService>['questionService'];
  let progressService: ReturnType<typeof createPlacementService>['progressService'];

  beforeEach(() => {
    const created = createPlacementService();
    service = created.service;
    sessionService = created.sessionService;
    questionService = created.questionService;
    progressService = created.progressService;
  });

  describe('startPlacement', () => {
    it('throws ConflictException if placement is already in progress', async () => {
      vi.mocked(sessionService.hasActiveSession).mockResolvedValue(true);

      await expect(service.startPlacement('user-1', { lang: 'de' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('initializes session and returns first question', async () => {
      vi.mocked(sessionService.hasActiveSession).mockResolvedValue(false);

      const result = await service.startPlacement('user-1', { lang: 'de' });
      expect(result).toEqual(mockPlacementQuestion);
      expect(questionService.getNewPlacementQuestion).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          lang: 'de',
          level: 'B1',
          totalAnswered: 0,
        }),
      );
    });
  });

  describe('checkEndedOrTimedOut', () => {
    it('throws NotFoundException if no session found', async () => {
      vi.mocked(sessionService.loadExamSession).mockResolvedValue(null);

      await expect(service.checkEndedOrTimedOut('user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if session has no currentQuestionId', async () => {
      vi.mocked(sessionService.loadExamSession).mockResolvedValue({
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        ended: false,
        currentQuestionId: null,
        servedAt: new Date().toISOString(),
      });

      await expect(service.checkEndedOrTimedOut('user-1')).rejects.toThrow(NotFoundException);
    });

    it('returns result when session already ended', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 6,
        ended: true,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      vi.mocked(sessionService.loadExamSession).mockResolvedValue(session);
      vi.mocked(progressService.getResult).mockResolvedValue(mockPlacementResult);

      const [resSession, question, result] = await service.checkEndedOrTimedOut('user-1');
      expect(resSession).toBe(session);
      expect(question).toBeUndefined();
      expect(result).toBe(mockPlacementResult);
    });

    it('handles timeout when elapsed time exceeds question limit', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date(Date.now() - 60000).toISOString(),
      };
      vi.mocked(sessionService.loadExamSession).mockResolvedValue(session);
      vi.mocked(progressService.getResult).mockResolvedValue(undefined);
      vi.mocked(progressService.getQuestion).mockResolvedValue(mockQuestion);
      vi.mocked(progressService.hasTimedOut).mockReturnValue(true);

      const [resSession, question, result] = await service.checkEndedOrTimedOut('user-1');
      expect(resSession).toBe(session);
      expect(question).toBe(mockQuestion);
      expect(result).toBe(mockPlacementQuestion);
    });

    it('returns question and undefined result when session is active and within time', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      vi.mocked(sessionService.loadExamSession).mockResolvedValue(session);
      vi.mocked(progressService.getResult).mockResolvedValue(undefined);
      vi.mocked(progressService.getQuestion).mockResolvedValue(mockQuestion);
      vi.mocked(progressService.hasTimedOut).mockReturnValue(false);

      const [resSession, question, result] = await service.checkEndedOrTimedOut('user-1');
      expect(resSession).toBe(session);
      expect(question).toBe(mockQuestion);
      expect(result).toBeUndefined();
    });
  });

  describe('getTimeOut', () => {
    it('archives timeout answer and returns new question when not ended', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      vi.mocked(progressService.getResult).mockResolvedValue(undefined);

      const result = await service.getTimeOut('user-1', mockQuestion, session);
      expect(result).toBe(mockPlacementQuestion);
      expect(sessionService.archiveQuestionAnswer).toHaveBeenCalledWith('user-1', {
        questionId: mockQuestion.id,
        choice: null,
      });
      expect(session.totalAnswered).toBe(1);
      expect(progressService.adjustSessionFromAnswer).toHaveBeenCalledWith(
        null,
        mockQuestion,
        session,
        'user-1',
      );
      expect(sessionService.saveExamSession).toHaveBeenCalledWith('user-1', session);
      expect(questionService.getNewPlacementQuestion).toHaveBeenCalledWith('user-1', session);
    });

    it('archives timeout answer and returns result when ended', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 5,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      vi.mocked(progressService.getResult).mockResolvedValue(mockPlacementResult);

      const result = await service.getTimeOut('user-1', mockQuestion, session);
      expect(result).toBe(mockPlacementResult);
      expect(questionService.getNewPlacementQuestion).not.toHaveBeenCalled();
    });
  });

  describe('getPlacement', () => {
    it('returns result when session is ended or timed out to a result', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 6,
        ended: true,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      vi.mocked(sessionService.loadExamSession).mockResolvedValue(session);
      vi.mocked(progressService.getResult).mockResolvedValue(mockPlacementResult);

      const result = await service.getPlacement('user-1');
      expect(result).toEqual(mockPlacementResult);
    });

    it('returns current question when active', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      vi.mocked(sessionService.loadExamSession).mockResolvedValue(session);
      vi.mocked(progressService.getResult).mockResolvedValue(undefined);
      vi.mocked(progressService.getQuestion).mockResolvedValue(mockQuestion);
      vi.mocked(progressService.hasTimedOut).mockReturnValue(false);

      const result = await service.getPlacement('user-1');
      expect(result).toEqual(mockPlacementQuestion);
      expect(questionService.createPlacementQuestion).toHaveBeenCalledWith(mockQuestion, session);
    });
  });

  describe('submitAnswer', () => {
    it('returns current question if questionId does not match', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      vi.mocked(sessionService.loadExamSession).mockResolvedValue(session);
      vi.mocked(progressService.getResult).mockResolvedValue(undefined);
      vi.mocked(progressService.getQuestion).mockResolvedValue(mockQuestion);
      vi.mocked(progressService.hasTimedOut).mockReturnValue(false);

      const result = await service.submitAnswer('user-1', {
        questionId: 'other-question-id',
        choice: 'ist',
      });
      expect(result).toEqual(mockPlacementQuestion);
      expect(questionService.createPlacementQuestion).toHaveBeenCalledWith(mockQuestion, session);
      expect(sessionService.archiveQuestionAnswer).not.toHaveBeenCalled();
    });

    it('returns result if checkEndedOrTimedOut returns a result', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 6,
        ended: true,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      vi.mocked(sessionService.loadExamSession).mockResolvedValue(session);
      vi.mocked(progressService.getResult).mockResolvedValue(mockPlacementResult);

      const result = await service.submitAnswer('user-1', {
        questionId: mockQuestion.id,
        choice: 'ist',
      });
      expect(result).toEqual(mockPlacementResult);
    });

    it('archives answer, adjusts session, and returns result if ended', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      vi.mocked(sessionService.loadExamSession).mockResolvedValue(session);
      vi.mocked(progressService.getResult)
        .mockResolvedValueOnce(undefined) // first call in checkEndedOrTimedOut
        .mockResolvedValueOnce(mockPlacementResult); // second call after answer
      vi.mocked(progressService.getQuestion).mockResolvedValue(mockQuestion);
      vi.mocked(progressService.hasTimedOut).mockReturnValue(false);

      const result = await service.submitAnswer('user-1', {
        questionId: mockQuestion.id,
        choice: 'ist',
      });
      expect(result).toEqual(mockPlacementResult);
      expect(sessionService.archiveQuestionAnswer).toHaveBeenCalledWith('user-1', {
        questionId: mockQuestion.id,
        choice: 'ist',
      });
      expect(sessionService.saveExamSession).toHaveBeenCalledWith('user-1', session);
    });

    it('archives answer, adjusts session, and returns next question if not ended', async () => {
      const session: ExamSession = {
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      vi.mocked(sessionService.loadExamSession).mockResolvedValue(session);
      vi.mocked(progressService.getResult).mockResolvedValue(undefined);
      vi.mocked(progressService.getQuestion).mockResolvedValue(mockQuestion);
      vi.mocked(progressService.hasTimedOut).mockReturnValue(false);

      const result = await service.submitAnswer('user-1', {
        questionId: mockQuestion.id,
        choice: 'ist',
      });
      expect(result).toEqual(mockPlacementQuestion);
      expect(questionService.getNewPlacementQuestion).toHaveBeenCalledWith('user-1', session);
    });
  });

  describe('quitPlacement', () => {
    it('delegates to sessionService deleteSession', async () => {
      await service.quitPlacement('user-1');
      expect(sessionService.deleteSession).toHaveBeenCalledWith('user-1');
    });
  });
});
