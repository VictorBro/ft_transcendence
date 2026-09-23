import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  Language,
  Level,
  QuestionCategory,
  GeneratedBatchSchema,
  GeneratedBatch,
} from '@ft/shared';
import { PrismaService } from '../prisma/prisma.service';
import { LLM_PROVIDER, LlmProvider } from '../llm/llm.interface';
import { buildGenerateQuestionsPrompt } from './prompts/generate-questions.prompt';

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
  ) {
    const remainingCount = await this.prisma.questionBank.count({
      where: {
        lang,
        level,
        category,
        userSeenQuestions: { none: { userId } },
      },
    });

    if (remainingCount <= 2) {
      await this.replenishQuestions(lang, level, category);
    }

    return this.serveQuestion(userId, lang, level, category);
  }

  /**
   * Replenishes the QuestionBank with a batch of 5 new questions when the unseen pool runs low.
   *
   * Logic:
   * 1. Constructs the prompt ({ system, user }) for the specific cell (lang, level, category).
   * 2. Attempts LLM generation with exactly 1 retry on malformed JSON or network failure (Issue #54).
   * 3. Validates structure against GeneratedBatchSchema.
   * 4. Persists the 5 items to QuestionBank with sourceId = null (marker for unreviewed AI questions).
   */
  private async replenishQuestions(
    lang: Language,
    level: Level,
    category: QuestionCategory,
  ): Promise<void> {
    // 1. Build prompt containing system persona and user constraints
    const prompt = buildGenerateQuestionsPrompt({ lang, level, category });

    // Scoped outside the loop with union type (GeneratedBatch | null)
    // so it survives loop execution and acts as a sentinel for success.
    let batch: GeneratedBatch | null = null;

    // Retry loop: 1 initial attempt + 1 retry (max 2 attempts)
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const raw = await this.llmProvider.generateStructured<GeneratedBatch>(prompt);
        const result = GeneratedBatchSchema.safeParse(raw);

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
        level: item.level,
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
      `Successfully generated and inserted 5 questions for ${lang}-${level}-${category}`,
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
        questionBank: { lang, level, category }, // Filter through the foreign relation
      },
      orderBy: { createdAt: 'asc' }, // The oldest question this learner was ever served
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
