import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import type { LlmProvider } from '../llm/llm.interface';
import { QuestionGenerationService } from './questions-generation.service';
import { FIXTURE_TOPIC_BATCH } from '../llm/fixture.provider';
import { TOPICS, type GeneratedBatch } from '@ft/shared';

const VALID_BATCH = FIXTURE_TOPIC_BATCH;

const DUMMY_QUESTION = {
  id: 'q-1',
  sourceId: 'fr-gram-0001',
  lang: 'fr',
  level: 'A1',
  topic: 'verbs_morphology',
  category: 'grammar',
  question: 'Je ___ francais.',
  options: ['parle', 'parles', 'parlent', 'parler'],
  answer: 'parle',
  timeLimitS: 30,
  readText: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

type MockPrismaService = {
  questionBank: {
    count: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
  };
  userSeenQuestion: {
    findFirst: ReturnType<typeof vi.fn>;
  };
};

describe('QuestionGenerationService', () => {
  let prismaMock: MockPrismaService;
  let llmProviderMock: LlmProvider;
  let service: QuestionGenerationService;

  beforeEach(() => {
    prismaMock = {
      questionBank: {
        count: vi.fn(),
        findFirst: vi.fn(),
        createMany: vi.fn(),
      },
      userSeenQuestion: {
        findFirst: vi.fn(),
      },
    };

    llmProviderMock = {
      generateStructured: vi.fn().mockResolvedValue(VALID_BATCH),
    };

    service = new QuestionGenerationService(
      prismaMock as unknown as PrismaService,
      llmProviderMock,
    );
  });

  describe('When pool is sufficiently stocked (> 2 questions remaining)', () => {
    it('serves the question directly without triggering LLM replenishment', async () => {
      prismaMock.questionBank.count.mockResolvedValue(3);
      prismaMock.questionBank.findFirst.mockResolvedValue(DUMMY_QUESTION);

      const result = await service.getOrGenerateQuestion('user-1', 'fr', 'A1', 'grammar');

      expect(result).toEqual(DUMMY_QUESTION);
      expect(llmProviderMock.generateStructured).not.toHaveBeenCalled();
      expect(prismaMock.questionBank.createMany).not.toHaveBeenCalled();
      expect(prismaMock.questionBank.findFirst).toHaveBeenCalledWith({
        where: {
          lang: 'fr',
          level: 'A1',
          category: 'grammar',
          userSeenQuestions: { none: { userId: 'user-1' } },
        },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('When pool runs dry (<= 2 questions remaining)', () => {
    it('triggers LLM generation, persists one item per topic with sourceId = null, and serves a question', async () => {
      prismaMock.questionBank.count.mockResolvedValue(1);
      prismaMock.questionBank.findFirst.mockResolvedValue(DUMMY_QUESTION);

      const result = await service.getOrGenerateQuestion('user-1', 'en', 'A1', 'grammar');
      await service['inFlight'].get('en:A1:grammar');

      expect(llmProviderMock.generateStructured).toHaveBeenCalledTimes(1);
      expect(prismaMock.questionBank.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            sourceId: null, // Critical Issue #54 rule: null marks unreviewed LLM rows
            lang: 'en',
            category: 'grammar',
            level: 'A1',
            question: 'She eats ___ apple.',
          }),
        ]),
      });
      const createManyCall = prismaMock.questionBank.createMany.mock.calls[0][0];
      expect(createManyCall.data).toHaveLength(TOPICS.length);
      expect(result).toEqual(DUMMY_QUESTION);
    });

    it('files generated questions under the requested level, not the one the LLM wrote', async () => {
      prismaMock.questionBank.count.mockResolvedValue(0);
      prismaMock.questionBank.findFirst.mockResolvedValue(DUMMY_QUESTION);

      await service.getOrGenerateQuestion('user-1', 'en', 'B2', 'grammar');
      await service['inFlight'].get('en:B2:grammar');

      const createManyCall = prismaMock.questionBank.createMany.mock.calls[0][0];
      expect(createManyCall.data.every((row: { level: string }) => row.level === 'B2')).toBe(true);
    });

    it('rejects a batch that repeats a topic instead of covering all of them', async () => {
      prismaMock.questionBank.count.mockResolvedValue(0);
      prismaMock.questionBank.findFirst.mockResolvedValue(DUMMY_QUESTION);

      const [first, ...rest] = VALID_BATCH.items;
      const repeatedTopic: GeneratedBatch = {
        items: [first, ...rest.slice(0, -1), { ...first, question: 'He eats ___ egg.' }],
      };
      vi.mocked(llmProviderMock.generateStructured).mockResolvedValue(repeatedTopic);

      await service.getOrGenerateQuestion('user-1', 'en', 'A1', 'grammar');
      await service['inFlight'].get('en:A1:grammar');

      expect(llmProviderMock.generateStructured).toHaveBeenCalledTimes(2);
      expect(prismaMock.questionBank.createMany).not.toHaveBeenCalled();
    });
  });

  describe('Retry mechanism on malformed LLM responses (Issue #54)', () => {
    it('retries once if the first response is malformed, then persists on second attempt success', async () => {
      prismaMock.questionBank.count.mockResolvedValue(0);
      prismaMock.questionBank.findFirst.mockResolvedValue(DUMMY_QUESTION);

      const malformedBatch = {
        items: [{ invalidField: 'wrong' }], // Violates GeneratedBatchSchema
      };

      vi.mocked(llmProviderMock.generateStructured)
        .mockResolvedValueOnce(malformedBatch as unknown as GeneratedBatch)
        .mockResolvedValueOnce(VALID_BATCH);

      const result = await service.getOrGenerateQuestion('user-1', 'en', 'A1', 'grammar');
      await service['inFlight'].get('en:A1:grammar');

      expect(llmProviderMock.generateStructured).toHaveBeenCalledTimes(2);
      expect(prismaMock.questionBank.createMany).toHaveBeenCalledTimes(1);
      expect(result).toEqual(DUMMY_QUESTION);
    });

    it('retries once if the provider throws an error on first attempt', async () => {
      prismaMock.questionBank.count.mockResolvedValue(0);
      prismaMock.questionBank.findFirst.mockResolvedValue(DUMMY_QUESTION);

      vi.mocked(llmProviderMock.generateStructured)
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce(VALID_BATCH);

      const result = await service.getOrGenerateQuestion('user-1', 'en', 'A1', 'grammar');
      await service['inFlight'].get('en:A1:grammar');

      expect(llmProviderMock.generateStructured).toHaveBeenCalledTimes(2);
      expect(prismaMock.questionBank.createMany).toHaveBeenCalledTimes(1);
      expect(result).toEqual(DUMMY_QUESTION);
    });
  });

  describe('Fallback mechanism when generation fails after 2 attempts (Issue #54)', () => {
    it('falls back to the oldest question seen by this user from UserSeenQuestion', async () => {
      prismaMock.questionBank.count.mockResolvedValue(0);
      // findFirst on questionBank finds nothing (empty bank)
      prismaMock.questionBank.findFirst.mockResolvedValue(null);

      // LLM fails both attempts
      vi.mocked(llmProviderMock.generateStructured)
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockRejectedValueOnce(new Error('503 Service Unavailable'));

      const oldestSeenRecord = {
        id: 'seen-1',
        userId: 'user-1',
        questionId: DUMMY_QUESTION.id,
        createdAt: new Date('2025-01-01'),
        questionBank: DUMMY_QUESTION,
      };

      prismaMock.userSeenQuestion.findFirst.mockResolvedValue(oldestSeenRecord);

      const result = await service.getOrGenerateQuestion('user-1', 'fr', 'A1', 'grammar', [
        'q-answered',
        'q-current',
      ]);
      await service['inFlight'].get('fr:A1:grammar');

      // No malformed or dummy questions persisted
      expect(prismaMock.questionBank.createMany).not.toHaveBeenCalled();

      // Fallback skips questions already served in this run
      expect(prismaMock.userSeenQuestion.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          questionId: { notIn: ['q-answered', 'q-current'] },
          questionBank: { lang: 'fr', level: 'A1', category: 'grammar' },
        },
        orderBy: { updatedAt: 'asc' },
        include: { questionBank: true },
      });

      // The learner receives the oldest seen question rather than a blocked exam
      expect(result).toEqual(DUMMY_QUESTION);
    });

    it('returns null if both bank and seen history are completely empty', async () => {
      prismaMock.questionBank.count.mockResolvedValue(0);
      prismaMock.questionBank.findFirst.mockResolvedValue(null);
      vi.mocked(llmProviderMock.generateStructured).mockRejectedValue(new Error('Down'));
      prismaMock.userSeenQuestion.findFirst.mockResolvedValue(null);

      const result = await service.getOrGenerateQuestion('user-1', 'fr', 'A1', 'grammar');

      expect(result).toBeNull();
    });
  });
});
