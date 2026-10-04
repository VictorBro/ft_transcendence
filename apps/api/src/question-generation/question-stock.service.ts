import { Inject, Injectable, Logger } from '@nestjs/common';
import { GeneratedItem, generatedBatchSchema } from '@ft/shared';

import { LLM_PROVIDER, LlmError, LlmProvider } from '../llm/llm.provider';
import { PrismaService } from '../prisma/prisma.service';
import { buildQuestionBatchPrompt } from './prompts/question-batch.prompt';
import { Cell, freshItems, toRows } from './question-batch';

/** A learner down to this many unseen questions in a cell triggers a restock. */
const RESTOCK_AT = 3;
/** After a failure, or a batch with nothing new, a cell is left alone this long. */
const COOLDOWN_MS = 10 * 60_000;

export type RestockOutcome = {
  status: 'stocked' | 'busy' | 'cooling' | 'filled' | 'failed';
  inserted: number;
};

@Injectable()
export class QuestionStockService {
  private readonly logger = new Logger(QuestionStockService.name);
  // In memory, so per process: enough for the single API replica (#44).
  private readonly inFlight = new Map<string, Promise<RestockOutcome>>();
  private readonly coolingUntil = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  /** Adds a generated batch to a cell running low. Never rejects, so callers need not await it. */
  async restock(cell: Cell, unseen: number): Promise<RestockOutcome> {
    if (unseen > RESTOCK_AT) return { status: 'stocked', inserted: 0 };

    const key = `${cell.lang}:${cell.level}:${cell.category}`;
    if (this.inFlight.has(key)) return { status: 'busy', inserted: 0 };
    if (Date.now() < (this.coolingUntil.get(key) ?? 0)) return { status: 'cooling', inserted: 0 };

    const job = this.fill(cell, key).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, job);
    return job;
  }

  private async fill(cell: Cell, key: string): Promise<RestockOutcome> {
    try {
      const items = await this.generate(cell, key);
      const stored = await this.prisma.questionBank.findMany({
        where: cell,
        select: { question: true, readText: true },
      });
      const { count } = await this.prisma.questionBank.createMany({
        data: toRows(cell, freshItems(items, stored)),
      });
      this.logger.log(`restocked ${key}: ${count} of ${items.length} questions were new`);
      if (count === 0) this.coolingUntil.set(key, Date.now() + COOLDOWN_MS);
      return { status: 'filled', inserted: count };
    } catch (error) {
      this.logger.warn(`restock ${key} failed: ${String(error)}`);
      this.coolingUntil.set(key, Date.now() + COOLDOWN_MS);
      return { status: 'failed', inserted: 0 };
    }
  }

  private async generate(cell: Cell, key: string): Promise<GeneratedItem[]> {
    const request = {
      purpose: `question-batch:${cell.category}`,
      schema: generatedBatchSchema(cell.category),
      ...buildQuestionBatchPrompt(cell),
    } as const;
    try {
      return (await this.llm.generateStructured(request)).items;
    } catch (error) {
      if (!(error instanceof LlmError && error.retryable)) throw error;
      this.logger.warn(`retrying ${key}: ${error.message}`);
      return (await this.llm.generateStructured(request)).items;
    }
  }
}
