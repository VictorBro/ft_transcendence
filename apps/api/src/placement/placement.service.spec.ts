import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExamSession, PlacementQuestion, PlacementResult } from '@ft/shared';

import type { QuestionBank } from '../generated/prisma/client';
import { PlacementSessionService } from './placement-session.service';
import { PlacementQuestionService } from './placement-question.service';
import { PlacementProgressService } from './placement-progress.service';
import { PlacementService } from './placement.service';

const LOCK_TOKEN = 'placement-lock-token';
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
    acquireLock: vi.fn().mockResolvedValue(LOCK_TOKEN),
    acquireLockWithRetry: vi.fn().mockResolvedValue(LOCK_TOKEN),
    releaseLock: vi.fn().mockResolvedValue(undefined),
    hasActiveSession: vi.fn().mockResolvedValue(false),
    saveExamSession: vi.fn().mockResolvedValue(undefined),
    loadExamSession: vi.fn().mockResolvedValue(null),
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
    checkOnboardingCompleted: vi.fn().mockResolvedValue(true),
    updateUserLevel: vi.fn().mockResolvedValue(undefined),
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
    it('throws ConflictException if lock cannot be acquired', async () => {
      vi.mocked(sessionService.acquireLock).mockResolvedValue(null);

      await expect(service.startPlacement('user-1', { lang: 'de' })).rejects.toThrow(
        new ConflictException('placement.inProgress'),
      );
      expect(sessionService.releaseLock).not.toHaveBeenCalled();
    });

    it('throws ConflictException and releases lock if placement is already in progress', async () => {
      vi.mocked(sessionService.hasActiveSession).mockResolvedValue(true);

      await expect(service.startPlacement('user-1', { lang: 'de' })).rejects.toThrow(
        ConflictException,
      );
      expect(sessionService.releaseLock).toHaveBeenCalledWith('user-1', LOCK_TOKEN);
    });

    it('throws ConflictException and releases lock if onboarding is incomplete', async () => {
      vi.mocked(sessionService.hasActiveSession).mockResolvedValue(false);
      vi.mocked(progressService.checkOnboardingCompleted).mockResolvedValue(false);

      await expect(service.startPlacement('user-1', { lang: 'de' })).rejects.toThrow(
        new ConflictException('placement.onboardingIncomplete'),
      );
      expect(sessionService.releaseLock).toHaveBeenCalledWith('user-1', LOCK_TOKEN);
    });

    it('initializes session, returns first question, and releases lock', async () => {
      vi.mocked(sessionService.hasActiveSession).mockResolvedValue(false);
      vi.mocked(progressService.checkOnboardingCompleted).mockResolvedValue(true);

      const result = await service.startPlacement('user-1', { lang: 'de' });
      expect(result).toEqual(mockPlacementQuestion);
      expect(sessionService.deleteSession).toHaveBeenCalledWith('user-1');
      expect(sessionService.releaseLock).toHaveBeenCalledWith('user-1', LOCK_TOKEN);
      expect(questionService.getNewPlacementQuestion).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          evalId: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          ),
          lang: 'de',
          level: 'B1',
          totalAnswered: 0,
          answers: [],
        }),
      );
      expect(sessionService.saveExamSession).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ lang: 'de', level: 'B1', answers: [] }),
      );
    });

    it('purges existing stale session and leftover answers on start', async () => {
      vi.mocked(sessionService.hasActiveSession).mockResolvedValue(false);
      vi.mocked(progressService.checkOnboardingCompleted).mockResolvedValue(true);

      await service.startPlacement('user-1', { lang: 'de' });

      expect(sessionService.deleteSession).toHaveBeenCalledWith('user-1');
    });
  });

  describe('checkEndedOrTimedOut', () => {
    it('throws NotFoundException if no session found', async () => {
      vi.mocked(sessionService.loadExamSession).mockResolvedValue(null);

      await expect(service.checkEndedOrTimedOut('user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if session has no currentQuestionId', async () => {
      vi.mocked(sessionService.loadExamSession).mockResolvedValue({
        evalId: EVAL_ID,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        answers: [],
        ended: false,
        currentQuestionId: null,
        servedAt: new Date().toISOString(),
      });

      await expect(service.checkEndedOrTimedOut('user-1')).rejects.toThrow(NotFoundException);
    });

    it('returns result when session already ended', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 6,
        answers: [],
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

    it('handles timeout when elapsed time exceeds question limit and exam continues', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        answers: [],
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
      expect(session.answers).toEqual([{ questionId: mockQuestion.id, choice: null }]);
      expect(session.totalAnswered).toBe(1);
      expect(progressService.adjustSessionFromAnswer).toHaveBeenCalledWith(
        null,
        mockQuestion,
        session,
        'user-1',
      );
      expect(sessionService.saveExamSession).toHaveBeenCalledTimes(1);
      expect(sessionService.saveExamSession).toHaveBeenCalledWith('user-1', session);
      expect(questionService.getNewPlacementQuestion).toHaveBeenCalledWith('user-1', session);
    });

    it('handles timeout when elapsed time exceeds question limit and exam ends', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 5,
        answers: [],
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date(Date.now() - 60000).toISOString(),
      };
      vi.mocked(sessionService.loadExamSession).mockResolvedValue(session);
      vi.mocked(progressService.getResult)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockPlacementResult);
      vi.mocked(progressService.getQuestion).mockResolvedValue(mockQuestion);
      vi.mocked(progressService.hasTimedOut).mockReturnValue(true);

      const [resSession, question, result] = await service.checkEndedOrTimedOut('user-1');
      expect(resSession).toBe(session);
      expect(question).toBe(mockQuestion);
      expect(result).toBe(mockPlacementResult);
      expect(sessionService.saveExamSession).toHaveBeenCalledTimes(1);
      expect(sessionService.saveExamSession).toHaveBeenCalledWith('user-1', session);
      expect(questionService.getNewPlacementQuestion).not.toHaveBeenCalled();
    });

    it('returns question and undefined result when session is active and within time', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        answers: [],
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

  describe('getPlacement', () => {
    it('returns result when session is ended or timed out to a result', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 6,
        answers: [],
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
        evalId: EVAL_ID,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        answers: [],
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
    it('throws ConflictException if lock cannot be acquired', async () => {
      vi.mocked(sessionService.acquireLockWithRetry).mockResolvedValue(null);

      await expect(
        service.submitAnswer('user-1', { questionId: 'q-1', choice: 'a' }),
      ).rejects.toThrow(new ConflictException('placement.inProgress'));
      expect(sessionService.releaseLock).not.toHaveBeenCalled();
    });

    it('releases lock even if checkEndedOrTimedOut throws', async () => {
      vi.mocked(sessionService.loadExamSession).mockResolvedValue(null);

      await expect(
        service.submitAnswer('user-1', { questionId: 'q-1', choice: 'a' }),
      ).rejects.toThrow(NotFoundException);
      expect(sessionService.releaseLock).toHaveBeenCalledWith('user-1', LOCK_TOKEN);
    });

    it('throws BadRequestException and releases lock if choice is not in question options', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        answers: [],
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      vi.mocked(sessionService.loadExamSession).mockResolvedValue(session);
      vi.mocked(progressService.getResult).mockResolvedValue(undefined);
      vi.mocked(progressService.getQuestion).mockResolvedValue(mockQuestion);
      vi.mocked(progressService.hasTimedOut).mockReturnValue(false);

      await expect(
        service.submitAnswer('user-1', {
          questionId: mockQuestion.id,
          choice: 'not-an-option',
        }),
      ).rejects.toThrow(new BadRequestException('placement.invalidChoice'));
      expect(sessionService.releaseLock).toHaveBeenCalledWith('user-1', LOCK_TOKEN);
      expect(session.answers).toEqual([]);
    });

    it('throws placement.questionMismatch if questionId does not match', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        answers: [],
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      vi.mocked(sessionService.loadExamSession).mockResolvedValue(session);
      vi.mocked(progressService.getResult).mockResolvedValue(undefined);
      vi.mocked(progressService.getQuestion).mockResolvedValue(mockQuestion);
      vi.mocked(progressService.hasTimedOut).mockReturnValue(false);

      await expect(
        service.submitAnswer('user-1', {
          questionId: 'other-question-id',
          choice: 'ist',
        }),
      ).rejects.toThrow(new ConflictException('placement.questionMismatch'));
      expect(session.answers).toEqual([]);
      expect(sessionService.releaseLock).toHaveBeenCalledWith('user-1', LOCK_TOKEN);
    });

    it('returns result if checkEndedOrTimedOut returns a result', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 6,
        answers: [],
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
        evalId: EVAL_ID,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        answers: [],
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
      expect(session.answers).toEqual([{ questionId: mockQuestion.id, choice: 'ist' }]);
      expect(sessionService.saveExamSession).toHaveBeenCalledWith('user-1', session);
    });

    it('archives answer, adjusts session, and returns next question if not ended', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        answers: [],
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
      expect(sessionService.saveExamSession).toHaveBeenCalledTimes(1);
      expect(questionService.getNewPlacementQuestion).toHaveBeenCalledWith('user-1', session);
    });
  });

  describe('quitPlacement', () => {
    it('deletes the session while holding the placement lock', async () => {
      await service.quitPlacement('user-1');

      expect(sessionService.acquireLockWithRetry).toHaveBeenCalledWith('user-1');
      expect(sessionService.deleteSession).toHaveBeenCalledWith('user-1');
      expect(sessionService.releaseLock).toHaveBeenCalledWith('user-1', LOCK_TOKEN);
    });

    it('rejects quitting while another placement mutation owns the lock', async () => {
      vi.mocked(sessionService.acquireLockWithRetry).mockResolvedValue(null);

      await expect(service.quitPlacement('user-1')).rejects.toThrow(
        new ConflictException('placement.inProgress'),
      );
      expect(sessionService.deleteSession).not.toHaveBeenCalled();
      expect(sessionService.releaseLock).not.toHaveBeenCalled();
    });

    it('releases the lock when deleting the session fails', async () => {
      vi.mocked(sessionService.deleteSession).mockRejectedValue(new Error('redis down'));

      await expect(service.quitPlacement('user-1')).rejects.toThrow('redis down');
      expect(sessionService.releaseLock).toHaveBeenCalledWith('user-1', LOCK_TOKEN);
    });
  });

  describe('abortExam', () => {
    const mockAbortedResult: PlacementResult = {
      targetLevel: null,
      report: [],
    };

    it('throws ConflictException if lock cannot be acquired', async () => {
      vi.mocked(sessionService.acquireLockWithRetry).mockResolvedValue(null);

      await expect(service.abortExam('user-1')).rejects.toThrow(
        new ConflictException('placement.inProgress'),
      );
      expect(sessionService.releaseLock).not.toHaveBeenCalled();
    });

    it('throws NotFoundException if no active session', async () => {
      vi.mocked(sessionService.loadExamSession).mockResolvedValue(null);

      await expect(service.abortExam('user-1')).rejects.toThrow(NotFoundException);
      expect(sessionService.releaseLock).toHaveBeenCalledWith('user-1', LOCK_TOKEN);
    });

    it('returns existing result if session is already ended', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 6,
        answers: [],
        ended: true,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      vi.mocked(sessionService.loadExamSession).mockResolvedValue(session);
      vi.mocked(progressService.getResult).mockResolvedValue(mockPlacementResult);

      const result = await service.abortExam('user-1');
      expect(result).toBe(mockPlacementResult);
      expect(session.answers).toEqual([]);
      expect(sessionService.releaseLock).toHaveBeenCalledWith('user-1', LOCK_TOKEN);
    });

    it('archives current question with null choice, sets level to null, persists, and returns aborted result', async () => {
      const session: ExamSession = {
        evalId: EVAL_ID,
        lang: 'de',
        lo: 'A1',
        hi: 'C2',
        level: 'B1',
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 3,
        answers: [],
        ended: false,
        currentQuestionId: mockQuestion.id,
        servedAt: new Date().toISOString(),
      };
      vi.mocked(sessionService.loadExamSession).mockResolvedValue(session);
      vi.mocked(progressService.getResult).mockResolvedValue(mockAbortedResult);
      vi.mocked(progressService.updateUserLevel).mockResolvedValue(undefined);

      const result = await service.abortExam('user-1');

      expect(session.answers).toEqual([{ questionId: mockQuestion.id, choice: null }]);
      expect(session.ended).toBe(true);
      expect(session.level).toBeNull();
      expect(progressService.updateUserLevel).toHaveBeenCalledWith('user-1', 'de', null, EVAL_ID);
      expect(sessionService.saveExamSession).toHaveBeenCalledWith('user-1', session);
      expect(result).toBe(mockAbortedResult);
      expect(sessionService.releaseLock).toHaveBeenCalledWith('user-1', LOCK_TOKEN);
    });

    it('releases lock even if an error occurs', async () => {
      vi.mocked(sessionService.loadExamSession).mockRejectedValue(new Error('redis down'));

      await expect(service.abortExam('user-1')).rejects.toThrow('redis down');
      expect(sessionService.releaseLock).toHaveBeenCalledWith('user-1', LOCK_TOKEN);
    });
  });
});
