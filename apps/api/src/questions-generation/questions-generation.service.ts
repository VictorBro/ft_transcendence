import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  Language,
  Level,
  QuestionCategory,
  generatedBatchSchema,
  GeneratedBatch,
} from '@ft/shared';
import { PrismaService } from '../prisma/prisma.service';
import { LLM_PROVIDER, LlmProvider } from '../llm/llm.interface';
import { buildGenerateQuestionsPrompt } from './prompts/generate-questions.prompt';
import { QuestionBank } from '../generated/prisma/client';

/**
 * Service managing on-demand question replenishment and serving for placement exams.
 *
 * @Injectable() marks this class as a NestJS provider managed by the IoC container.
 * export class allows other modules (like QuestionGenerationModule) to import and use it.
 */
@Injectable()
export class QuestionGenerationService {
  /**
   * NestJS Logger instance. Passing QuestionGenerationService.name automatically prefixes
   * every terminal log entry with "[QuestionGenerationService]" for clear traceability.
   */
  private readonly logger = new Logger(QuestionGenerationService.name);

  /**
   * Registry of LLM generations currently running, one entry per cell.
   *
   * A Map is a key -> value dictionary:
   * - key: the cell, as the string "lang:level:category" (e.g. "fr:B1:grammar").
   * - value: the Promise of the running replenishQuestions call for that cell.
   *
   * NestJS services are singletons: one instance serves every request of every user,
   * so this Map is shared by all learners. That is what lets a second learner see
   * that a generation for the same cell is already running and skip it
   * (Issue #54: "generation happens once per cell, not once per learner").
   *
   * Limit: it lives in the memory of one Node process. Several API instances would
   * each have their own Map; a cross-instance lock would need Redis.
   */
  private readonly inFlight = new Map<string, Promise<void>>();

  /**
   * The constructor uses TypeScript parameter properties ("private readonly"):
   * - "private": limits access strictly to within this class.
   * - "readonly": prevents reassignment after initialization.
   *
   * NestJS Dependency Injection:
   * - prisma: automatically instantiated and injected via PrismaService.
   * - llmProvider: injected using the custom LLM_PROVIDER injection token (FixtureProvider or GeminiProvider).
   */
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PROVIDER) private readonly llmProvider: LlmProvider,
  ) {}

  async getOrGenerateQuestion(
    userId: string,
    lang: Language,
    level: Level,
    category: QuestionCategory,
    excludeQuestionIds: string[] = [],
  ): Promise<QuestionBank | null> {
    const remainingCount = await this.prisma.questionBank.count({
      where: {
        lang,
        level,
        category,
        userSeenQuestions: { none: { userId } },
      },
    });

    if (remainingCount <= 2) this.triggerReplenish(lang, level, category);

    return this.serveQuestion(userId, lang, level, category, excludeQuestionIds);
  }

  /**
   * Starts a replenishment in the background, without making the learner wait for the LLM.
   *
   * Why this method is NOT async:
   * - `async` only means "this function returns a Promise". Calling it without `await`
   *   is allowed: the call returns the Promise immediately and the caller moves on.
   * - replenishQuestions runs synchronously until its first `await` (the LLM request),
   *   then pauses and hands back a pending Promise. triggerReplenish returns right after,
   *   and getOrGenerateQuestion serves a question straight away.
   * - When the LLM answers, the Node.js event loop resumes replenishQuestions where it
   *   paused (validation, then createMany), even though the learner's HTTP response was
   *   sent long ago. Nobody waits for it: that is what "in the background" means.
   *
   * Logic:
   * 1. Builds the cell key and skips if a generation for that cell is already running.
   * 2. Starts replenishQuestions without `await` and keeps its Promise ("job").
   * 3. Attaches .catch: an un-awaited Promise that rejects with no handler becomes an
   *    "unhandled rejection", which can crash the whole API process.
   * 4. Attaches .finally: removes the key once the job ends (success or failure),
   *    otherwise the cell would stay marked as running and never be replenished again.
   * 5. Registers the job in inFlight so concurrent requests see it.
   */
  triggerReplenish(lang: Language, level: Level, category: QuestionCategory): void {
    // 1. One key per cell: same lang + level + category = same key
    const key = `${lang}:${level}:${category}`;
    if (this.inFlight.has(key)) return; // Already generating for this cell, do not start a duplicate

    // 2. No `await`: the LLM call starts now, and this method does not wait for it
    const job = this.replenishQuestions(lang, level, category)
      // 3. Mandatory error handler for a Promise nobody awaits
      .catch((error) => this.logger.error(`Replenish crashed for ${key}: ${error}`))
      // 4. Runs last, whatever happened: frees the cell for a future replenishment
      .finally(() => this.inFlight.delete(key));

    // 5. Set synchronously, before any other request can run, so the has() check above is reliable
    this.inFlight.set(key, job);
  }

  /**
   * Replenishes the QuestionBank with a batch of new questions when the unseen pool runs low:
   * one question per topic (13) for grammar and vocabulary, READING_BATCH_SIZE (5) for reading.
   *
   * Logic:
   * 1. Constructs the prompt ({ system, user }) for the specific cell (lang, level, category).
   * 2. Attempts LLM generation with exactly 1 retry on malformed JSON or network failure (Issue #54).
   * 3. Validates structure against generatedBatchSchema(category): batch size and topic coverage.
   * 4. Persists the items to QuestionBank with sourceId = null (marker for unreviewed AI questions).
   */
  private async replenishQuestions(
    lang: Language,
    level: Level,
    category: QuestionCategory,
  ): Promise<void> {
    // 1. Build prompt containing system persona and user constraints
    const prompt = buildGenerateQuestionsPrompt({ lang, level, category });
    const batchSchema = generatedBatchSchema(category);

    // Scoped outside the loop with union type (GeneratedBatch | null)
    // so it survives loop execution and acts as a sentinel for success.
    let batch: GeneratedBatch | null = null;

    // Retry loop: 1 initial attempt + 1 retry (max 2 attempts)
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const raw = await this.llmProvider.generateStructured<GeneratedBatch>(prompt);
        const result = batchSchema.safeParse(raw);

        if (result.success) {
          batch = result.data;
          break; // Successfully generated and validated, exit retry loop
        }

        this.logger.warn(
          `Attempt ${attempt}/2: malformed response for ${lang}-${level}-${category}`,
        );
      } catch (error) {
        this.logger.warn(
          `Attempt ${attempt}/2: provider error for ${lang}-${level}-${category}: ${error}`,
        );
      }
    } // End of retry loop

    // Type guard: If both attempts failed, log warning and exit cleanly.
    // The fallback mechanism in serveQuestion will take over.
    if (!batch) {
      this.logger.warn(
        `Failed to replenish questions for ${lang}-${level}-${category} after 2 attempts`,
      );
      return;
    }

    // batch is now guaranteed non-null (TypeScript type narrowing).
    // Array.prototype.map() transforms each generated item into the QuestionBank DB schema.
    await this.prisma.questionBank.createMany({
      data: batch.items.map((item) => ({
        sourceId: null, // Critical Issue #54 rule: null marks unreviewed LLM rows
        lang,
        level, // The requested cell, not item.level: the LLM may drift and misfile the question
        topic: item.topic,
        category,
        question: item.question,
        options: item.options,
        answer: item.answer,
        timeLimitS: item.timeLimitS,
        readText: item.readText ?? null, // Convert undefined to SQL NULL
      })),
    });

    this.logger.log(
      `Successfully generated and inserted ${batch.items.length} questions for ${lang}-${level}-${category}`,
    );
  }

  /**
   * Serves a question to the learner for a specific cell (lang, level, category).
   *
   * What it does:
   * 1. Primary path: Attempts to find an unseen question in `QuestionBank` that this learner
   *    has not yet encountered (`userSeenQuestions: { none: { userId } }`).
   * 2. Fallback path (Issue #54): If the bank is completely exhausted and the LLM generation
   *    failed, it retrieves the learner's oldest previously seen question in this cell from
   *    the `UserSeenQuestion` join table rather than blocking the exam.
   *
   * Where and How it queries:
   * - Step 1 queries `prisma.questionBank`: finds an unencountered row ordered by createdAt ascending.
   * - Step 2 queries `prisma.userSeenQuestion`: filters by userId and the related cell properties,
   *   ordered by createdAt ascending (oldest first).
   *   `include: { questionBank: true }` performs a SQL JOIN to retrieve the full QuestionBank row
   *   so the question, choices, and time limit can be rendered.
   */
  private async serveQuestion(
    userId: string,
    lang: Language,
    level: Level,
    category: QuestionCategory,
    excludeQuestionIds: string[],
  ) {
    // 1. Primary path: find the first question this learner has not seen yet
    const question = await this.prisma.questionBank.findFirst({
      where: {
        lang,
        level,
        category,
        userSeenQuestions: { none: { userId } },
      },
      orderBy: { createdAt: 'asc' }, // FIFO: serve oldest available unseen questions first
    });

    if (question) {
      return question;
    }

    // 2. Emergency fallback path (Issue #54 requirement):
    // If the bank is dry and generation failed, query UserSeenQuestion for the oldest seen question.
    // Notice: We query `userSeenQuestion` (not questionBank) because userId history lives here.
    const oldestSeen = await this.prisma.userSeenQuestion.findFirst({
      where: {
        userId,
        questionId: { notIn: excludeQuestionIds },
        questionBank: { lang, level, category }, // Filter through the foreign relation
      },
      orderBy: { updatedAt: 'asc' }, // Least recently served: re-serving bumps updatedAt, so fallbacks rotate
      include: { questionBank: true }, // SQL JOIN to attach the full QuestionBank record
    });

    if (oldestSeen) {
      this.logger.warn(
        `Serving fallback (oldest seen) question for user ${userId} in ${lang}-${level}-${category}`,
      );
      return oldestSeen.questionBank; // Return the joined QuestionBank row
    }

    // Extreme edge case: neither unseen nor seen questions exist in this cell
    return null;
  }
}
