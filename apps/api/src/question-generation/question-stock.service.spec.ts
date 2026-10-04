import { Logger } from '@nestjs/common';
import {
  type GeneratedBatch,
  type GeneratedItem,
  generatedBatchSchema,
  type QuestionCategory,
  READING_TOPIC,
} from '@ft/shared';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { z } from 'zod';

import { FixtureProvider } from '../llm/fixture.provider';
import { LlmError, type LlmProvider } from '../llm/llm.provider';
import type { PrismaService } from '../prisma/prisma.service';
import { buildQuestionBatchPrompt } from './prompts/question-batch.prompt';
import type { Cell } from './question-batch';
import { QuestionStockService } from './question-stock.service';

const cell: Cell = { lang: 'fr', level: 'B1', category: 'vocabulary' };
const item = (question: string): GeneratedItem => ({
  topic: 'verb_usage',
  question,
  options: ['arrêté', 'cessé', 'fini', 'quitté'],
  answer: 'arrêté',
});
const batch: GeneratedBatch = { items: [item('Il a ___ de fumer.'), item('Elle ___ tôt.')] };
const batches: Record<QuestionCategory, GeneratedBatch> = {
  vocabulary: batch,
  grammar: { items: [{ ...item('Nous ___ partis hier.'), topic: 'verbs_morphology' }] },
  reading: {
    items: [{ ...item('Que fait Paul ?'), topic: READING_TOPIC, readText: 'Paul lit le journal.' }],
  },
};

/** `stored` is what the cell already holds. */
function setup(stored: { question: string; readText: string | null }[] = []) {
  const prisma = {
    questionBank: {
      findMany: vi.fn(async () => stored),
      createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
    },
  };
  const llm = { generateStructured: vi.fn().mockResolvedValue(batch) };
  const service = new QuestionStockService(
    prisma as unknown as PrismaService,
    llm as unknown as LlmProvider,
  );
  return { prisma, llm, service };
}

describe('QuestionStockService', () => {
  let log: MockInstance;
  let warn: MockInstance;

  beforeEach(() => {
    vi.useFakeTimers();
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('leaves a cell alone while the learner has more than 3 unseen questions in it', async () => {
    const { service, llm } = setup();

    await expect(service.restock(cell, 4)).resolves.toEqual({ status: 'stocked', inserted: 0 });
    expect(llm.generateStructured).not.toHaveBeenCalled();

    await expect(service.restock(cell, 3)).resolves.toEqual({ status: 'filled', inserted: 2 });
  });

  // Spreading the item pins readText on the reading rows.
  it.each([
    ['vocabulary', 45],
    ['grammar', 60],
    ['reading', 90],
  ] as const)(
    "asks for a %s cell's batch and stores it unreviewed, with the time limit of the cell",
    async (category, timeLimitS) => {
      const { service, llm, prisma } = setup();
      const asked: Cell = { ...cell, category };
      llm.generateStructured.mockResolvedValue(batches[category]);

      await service.restock(asked, 0);

      const [request] = llm.generateStructured.mock.calls[0];
      expect(request).toMatchObject({
        purpose: `question-batch:${category}`,
        ...buildQuestionBatchPrompt(asked),
      });
      expect(z.toJSONSchema(request.schema)).toEqual(
        z.toJSONSchema(generatedBatchSchema(category)),
      );
      expect(prisma.questionBank.createMany).toHaveBeenCalledExactlyOnceWith({
        data: batches[category].items.map((row) => ({
          ...row,
          ...asked,
          sourceId: null,
          timeLimitS,
        })),
      });
    },
  );

  it('stores only the questions the cell does not have yet', async () => {
    const { service, prisma } = setup([{ question: 'il a ___  de fumer.', readText: null }]);

    await expect(service.restock(cell, 0)).resolves.toEqual({ status: 'filled', inserted: 1 });
    expect(prisma.questionBank.findMany).toHaveBeenCalledWith({
      where: cell,
      select: { question: true, readText: true },
    });
    expect(prisma.questionBank.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ question: 'Elle ___ tôt.' }),
    ]);
    expect(log).toHaveBeenCalledWith('restocked fr:B1:vocabulary: 1 of 2 questions were new');
  });

  it('runs one restock per cell at a time', async () => {
    const { service, llm } = setup();
    let answer!: (reply: GeneratedBatch) => void;
    llm.generateStructured.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));

    const first = service.restock(cell, 0);
    await expect(service.restock(cell, 0)).resolves.toEqual({ status: 'busy', inserted: 0 });
    await expect(service.restock({ ...cell, lang: 'de' }, 0)).resolves.toMatchObject({
      status: 'filled',
    });

    answer(batch);
    await expect(first).resolves.toEqual({ status: 'filled', inserted: 2 });
    await expect(service.restock(cell, 0)).resolves.toMatchObject({ status: 'filled' });
    expect(llm.generateStructured).toHaveBeenCalledTimes(3);
  });

  it('leaves a cell alone for 10 minutes after a failure', async () => {
    const { service, llm } = setup();
    llm.generateStructured.mockRejectedValueOnce(new LlmError('Gemini 403: denied', false));

    await expect(service.restock(cell, 0)).resolves.toEqual({ status: 'failed', inserted: 0 });
    expect(warn).toHaveBeenCalledWith(
      'restock fr:B1:vocabulary failed: LlmError: Gemini 403: denied',
    );
    await expect(service.restock(cell, 0)).resolves.toEqual({ status: 'cooling', inserted: 0 });
    await expect(service.restock({ ...cell, level: 'B2' }, 0)).resolves.toMatchObject({
      status: 'filled',
    });

    vi.advanceTimersByTime(10 * 60_000 - 1);
    await expect(service.restock(cell, 0)).resolves.toMatchObject({ status: 'cooling' });
    vi.advanceTimersByTime(1);
    await expect(service.restock(cell, 0)).resolves.toEqual({ status: 'filled', inserted: 2 });
  });

  it('leaves a cell alone for 10 minutes after a batch with nothing new, but not after one that added some', async () => {
    const stale = setup(batch.items.map(({ question }) => ({ question, readText: null })));
    await expect(stale.service.restock(cell, 0)).resolves.toEqual({
      status: 'filled',
      inserted: 0,
    });
    vi.advanceTimersByTime(10 * 60_000 - 1);
    await expect(stale.service.restock(cell, 0)).resolves.toMatchObject({ status: 'cooling' });
    vi.advanceTimersByTime(1);
    await expect(stale.service.restock(cell, 0)).resolves.toMatchObject({ status: 'filled' });

    const fresh = setup();
    await fresh.service.restock(cell, 0);
    await expect(fresh.service.restock(cell, 0)).resolves.toMatchObject({ status: 'filled' });
  });

  it.each([
    ['retries a retryable LlmError once', [new LlmError('Gemini 429', true)], 2, 'filled'],
    [
      'fails on a second retryable LlmError',
      [new LlmError('Gemini 503', true), new LlmError('Gemini 503', true)],
      2,
      'failed',
    ],
    ['does not retry any other LlmError', [new LlmError('Gemini 400', false)], 1, 'failed'],
    ['does not retry an error of its own', [new TypeError('bug')], 1, 'failed'],
  ])('%s', async (_, errors, calls, status) => {
    const { service, llm } = setup();
    for (const error of errors) llm.generateStructured.mockRejectedValueOnce(error);

    await expect(service.restock(cell, 0)).resolves.toMatchObject({ status });
    expect(llm.generateStructured).toHaveBeenCalledTimes(calls);
  });

  it('retries with the same request, and logs why', async () => {
    const { service, llm } = setup();
    llm.generateStructured.mockRejectedValueOnce(new LlmError('Gemini 429: quota', true));

    await service.restock(cell, 0);

    const [[first], [second]] = llm.generateStructured.mock.calls;
    expect(second).toBe(first);
    expect(warn).toHaveBeenCalledWith('retrying fr:B1:vocabulary: Gemini 429: quota');
  });

  it('turns a database failure into a failed outcome, never a rejection', async () => {
    const { service, prisma } = setup();
    prisma.questionBank.createMany.mockRejectedValueOnce(new Error('connection lost'));

    await expect(service.restock(cell, 0)).resolves.toEqual({ status: 'failed', inserted: 0 });
    expect(warn).toHaveBeenCalledWith('restock fr:B1:vocabulary failed: Error: connection lost');
  });

  // A stack without a key: the cell gets nothing, so placement falls back to seen questions.
  it('stores nothing and cools down when there is no real LLM to ask', async () => {
    const { prisma } = setup();
    const service = new QuestionStockService(
      prisma as unknown as PrismaService,
      new FixtureProvider(),
    );

    await expect(service.restock(cell, 0)).resolves.toEqual({ status: 'failed', inserted: 0 });
    await expect(service.restock(cell, 0)).resolves.toMatchObject({ status: 'cooling' });
    expect(prisma.questionBank.createMany).not.toHaveBeenCalled();
  });
});
