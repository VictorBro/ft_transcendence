import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PlacementQuestion,
  PlacementQuestionSchema,
  PLACEMENT_ROUNDS,
  QUESTION_CATEGORIES,
  QuestionCategory,
  LEVELS,
} from '@ft/shared';

import { ExamSession } from './placement.schema';

import { QuestionBank } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  QuestionGenerationService,
  REPLENISH_WHEN_REMAINING_AT_MOST,
} from '../questions-generation/questions-generation.service';

export const LIMIT_UNSEEN_QUESTIONS_TO_RETRIEVE = Math.max(
  100,
  REPLENISH_WHEN_REMAINING_AT_MOST + 1,
);
export const MAX_QUESTIONS_PER_LEVEL = PLACEMENT_ROUNDS.perCategory * QUESTION_CATEGORIES.length;

@Injectable()
export class PlacementQuestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionGeneration: QuestionGenerationService,
  ) {}

  /**
   * Retrieves a new question for the user's current level, balancing question categories.
   * Prioritizes randomly selected unseen questions from the question bank and falls back to
   * least-recently-seen questions not yet served in the current session when the unseen pool is exhausted.
   * Any category running low on unseen questions is restocked in the background, without delaying this draw.
   *
   * @throws ConflictException If the exam has ended (`placement.expired`).
   * @throws NotFoundException If no questions exist in the pool for this level (`placement.poolExhausted`).
   */
  async getNewQuestion(
    userId: string,
    session: ExamSession,
  ): Promise<[Partial<Record<QuestionCategory, number>>, QuestionBank]> {
    if (session.ended || session.level === null) {
      throw new ConflictException('placement.expired');
    }

    const eligibleCategories = QUESTION_CATEGORIES.filter(
      (cat) => (session.askedPerCategory[cat] ?? 0) < PLACEMENT_ROUNDS.perCategory,
    );

    const pool = eligibleCategories.length > 0 ? eligibleCategories : QUESTION_CATEGORIES;
    const level = LEVELS[Math.max(0, Math.min(session.level, LEVELS.length - 1))];

    const availableByCategory: Partial<Record<QuestionCategory, number>> = {};
    const availableCategoryQuestions: QuestionBank[][] = [];

    for (const cat of pool) {
      const questions = await this.prisma.questionBank.findMany({
        where: {
          lang: session.lang,
          level,
          category: cat,
          userSeenQuestions: {
            none: {
              userId,
            },
          },
        },
        take: LIMIT_UNSEEN_QUESTIONS_TO_RETRIEVE,
      });

      availableByCategory[cat] = questions.length;
      if (questions.length <= REPLENISH_WHEN_REMAINING_AT_MOST) {
        this.questionGeneration.triggerReplenish(session.lang, level, cat);
      }
      if (questions.length > 0) {
        availableCategoryQuestions.push(questions);
      }
    }

    if (availableCategoryQuestions.length > 0) {
      const randomCategoryIndex = Math.floor(Math.random() * availableCategoryQuestions.length);
      const chosenCategoryQuestions = availableCategoryQuestions[randomCategoryIndex];
      const randomQuestionIndex = Math.floor(Math.random() * chosenCategoryQuestions.length);
      return [availableByCategory, chosenCategoryQuestions[randomQuestionIndex]];
    }

    const excludeQuestionIds = session.answers.map((answer) => answer.questionId);
    if (session.currentQuestionId) {
      excludeQuestionIds.push(session.currentQuestionId);
    }

    const recentSeen = await this.prisma.userSeenQuestion.findMany({
      where: {
        userId,
        ...(excludeQuestionIds.length > 0
          ? { questionId: { notIn: [...new Set(excludeQuestionIds)] } }
          : {}),
        questionBank: {
          lang: session.lang,
          level,
          category: { in: [...pool] },
        },
      },
      orderBy: {
        updatedAt: 'asc',
      },
      take: 10,
      include: {
        questionBank: true,
      },
    });

    if (recentSeen.length === 0) {
      throw new NotFoundException('placement.poolExhausted');
    }

    const randomSeen = recentSeen[Math.floor(Math.random() * recentSeen.length)];
    return [availableByCategory, randomSeen.questionBank];
  }

  /** The bank lists the answer first in almost every item, so the order must not leak it. */
  shuffleOptions(options: readonly string[]): string[] {
    const shuffled = [...options];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Recursively computes worst-case level probes (including current level)
   * remaining until the placement exam terminates, mirroring binary search transitions.
   */
  private maxProbes(lo: number, hi: number, level: number): number {
    const upProbes =
      level >= hi - 1 ? 0 : this.maxProbes(level + 1, hi, level + Math.ceil((hi - level) / 2));
    const downProbes =
      level <= lo ? 0 : this.maxProbes(lo, level, level - Math.ceil((level - lo) / 2));
    return 1 + Math.max(upProbes, downProbes);
  }

  /**
   * Calculates the maximum theoretical number of questions remaining in the exam.
   * Combines remaining questions at the current level with worst-case remaining binary search steps.
   * In active sessions, this value is guaranteed to be >= 1.
   *
   * @throws ConflictException If the session level is null (`placement.invalidSession`).
   */
  getMaxQuestionsRemaining(session: ExamSession): number {
    if (session.level === null) {
      throw new ConflictException('placement.invalidSession');
    }
    const askedInCurrentLevel = Object.values(session.askedPerCategory).reduce(
      (sum, count) => sum + count,
      0,
    );
    const probes = this.maxProbes(session.lo, session.hi, session.level);
    return Math.max(0, probes * MAX_QUESTIONS_PER_LEVEL - askedInCurrentLevel);
  }

  /**
   * Formats a database question into a validated client-facing `PlacementQuestion` DTO,
   * computing remaining time and progress, with the options in the order they were served.
   *
   * @throws ConflictException If the session has no served options (`placement.invalidSession`).
   */
  async createPlacementQuestion(
    question: QuestionBank,
    session: ExamSession,
  ): Promise<PlacementQuestion> {
    if (session.currentOptions === null) {
      throw new ConflictException('placement.invalidSession');
    }
    const elapsedS = Math.floor((Date.now() - new Date(session.servedAt).getTime()) / 1000);
    const remainingS = Math.max(0, question.timeLimitS - Math.max(0, elapsedS));

    const totalQuestions = this.getMaxQuestionsRemaining(session);

    return PlacementQuestionSchema.parse({
      questionId: question.id,
      category: question.category,
      level: question.level,
      question: question.question,
      ...(question.readText ? { readText: question.readText } : {}),
      options: session.currentOptions,
      timeLimitS: question.timeLimitS,
      remainingS,
      progress: {
        answered: session.totalAnswered,
        maxQuestionsRemaining: totalQuestions,
      },
    });
  }

  /**
   * Retrieves a new question, records it in `UserSeenQuestion`, updates session state
   * (including the shuffled option order), and returns the formatted question.
   */
  async getNewPlacementQuestion(
    userId: string,
    examSession: ExamSession,
  ): Promise<PlacementQuestion> {
    const [, question] = await this.getNewQuestion(userId, examSession);

    examSession.currentQuestionId = question.id;
    examSession.currentOptions = this.shuffleOptions(question.options);
    examSession.servedAt = new Date().toISOString();
    await this.prisma.userSeenQuestion.upsert({
      where: {
        userId_questionId: {
          userId,
          questionId: question.id,
        },
      },
      create: {
        userId,
        questionId: question.id,
      },
      update: {
        updatedAt: new Date(),
      },
    });
    return this.createPlacementQuestion(question, examSession);
  }
}
