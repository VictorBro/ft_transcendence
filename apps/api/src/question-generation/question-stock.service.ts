import { Inject, Injectable, Logger } from '@nestjs/common';
import { GeneratedItem, generatedBatchSchema } from '@ft/shared';

import { LLM_PROVIDER, LlmError, LlmProvider } from '../llm/llm.provider';
import { PrismaService } from '../prisma/prisma.service';
import { buildQuestionBatchPrompt } from './prompts/question-batch.prompt';
import { Cell, freshItems, toRows } from './question-batch';

/** A learner down to this many unseen questions in a cell triggers a restock. */
const RESTOCK_AT = 3;
/** After a failure, or a batch with nothing new, a cell is left alone this long (10 minutes). */
const COOLDOWN_MS = 10 * 60_000;

/**
 * What restock tells its caller. The "|" means status is one of these five texts:
 * - stocked: the learner still has enough questions, nothing to do.
 * - busy: a restock of this cell is already running, we do not start a second one.
 * - cooling: this cell failed (or gave nothing new) less than 10 minutes ago, wait.
 * - filled: we asked the LLM and saved the new questions ("inserted" says how many).
 * - failed: the LLM or the database failed. Logged, then the cell cools down.
 * Placement ignores this value; it is there for the tests and for reading the code.
 */
export type RestockOutcome = {
  status: 'stocked' | 'busy' | 'cooling' | 'filled' | 'failed';
  inserted: number;
};

/**
 * Keeps the question bank stocked: when a learner runs low on unseen questions in a
 * cell, it asks the LLM for a new batch and saves the new questions.
 * It only fills the bank. Choosing which question to show is PlacementQuestionService's job.
 *
 * Nest builds one instance for the whole API (a singleton), so the two Maps below are
 * shared by every learner. That is how a second learner sees that a restock is already
 * running for the same cell.
 */
@Injectable()
export class QuestionStockService {
  private readonly logger = new Logger(QuestionStockService.name);
  // Map = a dictionary from a key to a value. Here the key is the cell as a string,
  // like "fr:B1:grammar".
  // In memory, so per process: enough for the single API replica (#44).
  // With several API servers, each would have its own Maps.
  // inFlight: the restocks running now, cell -> its promise.
  private readonly inFlight = new Map<string, Promise<RestockOutcome>>();
  // coolingUntil: cell -> the time (in ms since 1970, like Date.now()) before which
  // we leave that cell alone.
  private readonly coolingUntil = new Map<string, number>();

  // Nest gives both: PrismaService by its class, the LLM by its token
  // (it is an interface, so it needs @Inject with the token).
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  /**
   * Adds a generated batch to a cell running low. Never rejects, so callers need not await it.
   * "unseen" is how many questions of this cell the learner has not seen yet.
   *
   * Three checks, in this order, each one can stop here:
   * 1. Enough questions left -> stocked.
   * 2. A restock of this cell is already running -> busy.
   * 3. The cell is cooling down -> cooling.
   * Otherwise it starts fill() and saves its promise in inFlight.
   *
   * Why the "busy" check is safe: JavaScript runs one thing at a time. Between
   * "inFlight.has" and "inFlight.set" there is no "await", so no other request can
   * run in between and start the same restock.
   */
  async restock(cell: Cell, unseen: number): Promise<RestockOutcome> {
    if (unseen > RESTOCK_AT) return { status: 'stocked', inserted: 0 };

    const key = `${cell.lang}:${cell.level}:${cell.category}`;
    if (this.inFlight.has(key)) return { status: 'busy', inserted: 0 };
    // "?? 0": a cell that never failed has no entry, so it counts as "cooling until 1970".
    if (Date.now() < (this.coolingUntil.get(key) ?? 0)) return { status: 'cooling', inserted: 0 };

    // No "await" on fill(): we keep its promise. ".finally" runs when it ends, success or
    // not, and frees the cell. Without it, the cell would stay "busy" forever.
    const job = this.fill(cell, key).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, job);
    return job;
  }

  /**
   * The restock itself: generate, remove duplicates, save.
   * Everything is in try/catch and every error becomes { status: 'failed' }, which is
   * what lets restock promise it never rejects. A promise that rejects with nobody
   * waiting for it ("unhandled rejection") can crash the Node process.
   */
  private async fill(cell: Cell, key: string): Promise<RestockOutcome> {
    try {
      // 1. Ask the LLM (with one retry when it makes sense, see generate).
      const items = await this.generate(cell, key);
      // 2. Read the questions already in this cell. "where: cell" works because Cell's
      //    fields have the same names as the columns. "select" reads only two columns.
      const stored = await this.prisma.questionBank.findMany({
        where: cell,
        select: { question: true, readText: true },
      });
      // 3. Keep only the new ones, turn them into rows, save them all in one query.
      //    createMany returns how many rows it inserted ("count").
      const { count } = await this.prisma.questionBank.createMany({
        data: toRows(cell, freshItems(items, stored)),
      });
      this.logger.log(`restocked ${key}: ${count} of ${items.length} questions were new`);
      // Nothing new: the model keeps writing questions we already have.
      // Asking again right away would cost money for nothing, so the cell cools down.
      if (count === 0) this.coolingUntil.set(key, Date.now() + COOLDOWN_MS);
      return { status: 'filled', inserted: count };
    } catch (error) {
      // Any failure (LLM or database): log it, and do not try this cell again for
      // 10 minutes. Otherwise a broken LLM would be called on every single draw.
      this.logger.warn(`restock ${key} failed: ${String(error)}`);
      this.coolingUntil.set(key, Date.now() + COOLDOWN_MS);
      return { status: 'failed', inserted: 0 };
    }
  }

  /**
   * Asks the LLM for one batch of questions for this cell.
   * Tries once; if the error is an LlmError marked retryable, tries a second time.
   * Any other error (not retryable, or the second try failing) goes up to fill.
   */
  private async generate(cell: Cell, key: string): Promise<GeneratedItem[]> {
    // The request: the purpose (for the logs), the schema the reply must match,
    // and "...buildQuestionBatchPrompt(cell)", which adds the system and user texts.
    // "as const" keeps purpose as its exact text type ("question-batch:grammar"...),
    // not just "string", so it matches LlmPurpose.
    const request = {
      purpose: `question-batch:${cell.category}`,
      schema: generatedBatchSchema(cell.category),
      ...buildQuestionBatchPrompt(cell),
    } as const;
    try {
      return (await this.llm.generateStructured(request)).items;
    } catch (error) {
      // "instanceof LlmError" checks the error's class (a catch can receive anything).
      // Only a retryable LlmError gets a second try; anything else is thrown again.
      if (!(error instanceof LlmError && error.retryable)) throw error;
      this.logger.warn(`retrying ${key}: ${error.message}`);
      return (await this.llm.generateStructured(request)).items;
    }
  }
}
