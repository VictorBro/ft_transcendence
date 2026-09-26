import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ExamSession,
  TARGET_LEVELS,
  PlacementQuestion,
  PlacementQuestionSchema,
  PLACEMENT_ROUNDS,
  QUESTION_CATEGORIES,
  QuestionCategory,
  TargetLevel,
  LEVELS,
} from '@ft/shared';

import { Level, QuestionBank } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const FETCH_NEW_QUESTIONS_FOR_CATEGORY_WHEN_REMAINING_LESS_THAN = 6;
export const LIMIT_UNSEEN_QUESTIONS_TO_RETRIEVE = Math.max(
  100,
  FETCH_NEW_QUESTIONS_FOR_CATEGORY_WHEN_REMAINING_LESS_THAN,
);
export const MAX_QUESTIONS_PER_LEVEL = 6;

@Injectable()
export class PlacementQuestionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves a new question for the user's current level, balancing question categories.
   * Prioritizes randomly selected unseen questions from the question bank and falls back to
   * least-recently-seen questions not yet served in the current session when the unseen pool is exhausted.
   *
   * @param userId - Unique identifier of the user.
   * @param session - Current exam session state.
   * @returns A tuple `[availableByCategory, question]` containing the number of available unseen
   * questions for every queried category and the chosen question.
   * @throws ConflictException If the exam has ended or reached terminal level C3 (`placement.expired`).
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

    const availableByCategory: Partial<Record<QuestionCategory, number>> = {};
    const availableCategoryQuestions: QuestionBank[][] = [];

    for (const cat of pool) {
      const questions = await this.prisma.questionBank.findMany({
        where: {
          lang: session.lang,
          level: LEVELS[Math.min(session.level, LEVELS.length)],
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

    if (
      Object.values(availableByCategory).some(
        (available) => available < FETCH_NEW_QUESTIONS_FOR_CATEGORY_WHEN_REMAINING_LESS_THAN,
      )
    ) {
      // todo for later PR: insert new questions into database, but asynchronously without user noticing
      // todo for Endrit: add parameter of alreadySeenQuestions to your function to not serve another function the user has already seen during the current session
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
          level: LEVELS[Math.min(session.level, LEVELS.length)],
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

  /**
   * Shuffles question options pseudo-randomly using a deterministic seed so that
   * repeated reads of the same served question preserve option order across reloads.
   *
   * @param options - Authored options array.
   * @param seed - Seed string (typically question ID and servedAt timestamp).
   * @returns Shuffled copy of the options array.
   */
  shuffleOptions(options: readonly string[], seed?: string): string[] {
    const random = seed
      ? (() => {
          let hash = 0;
          for (let i = 0; i < seed.length; i++) {
            hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
          }
          return () => {
            hash = (hash + 0x6d2b79f5) | 0;
            let t = Math.imul(hash ^ (hash >>> 15), 1 | hash);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
        })()
      : Math.random;

    const shuffled = [...options];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Calculates the maximum theoretical number of questions remaining in the exam.
   * Combines remaining questions at the current level with worst-case remaining binary search steps.
   * In active sessions, this value is guaranteed to be >= 1.
   *
   * @param session - Current exam session state.
   * @returns Theoretical maximum number of questions remaining.
   */
  getMaxQuestionsRemaining(session: ExamSession): number {
    const askedInCurrentLevel = Object.values(session.askedPerCategory).reduce(
      (sum, count) => sum + count,
      0,
    );
    const current_level_remaining = Math.max(0, MAX_QUESTIONS_PER_LEVEL - askedInCurrentLevel);

    // const loIndex = Math.max(0, TARGET_LEVELS.indexOf(session.lo));
    // const hiIndex = Math.max(0, TARGET_LEVELS.indexOf(session.hi));
    // const levelIndex = Math.max(0, TARGET_LEVELS.indexOf(session.level ?? 'A1'));

    const lowerDistance = Math.max(0, session.level - session.lo);
    const max_lower =
      lowerDistance > 0 ? (Math.floor(Math.log2(lowerDistance)) + 1) * MAX_QUESTIONS_PER_LEVEL : 0;

    const upperDistance = Math.max(0, session.hi - session.level - 1);
    const max_upper =
      upperDistance > 0 ? (Math.floor(Math.log2(upperDistance)) + 1) * MAX_QUESTIONS_PER_LEVEL : 0;

    return Math.max(0, current_level_remaining + Math.max(max_lower, max_upper));
  }

  /**
   * Formats a database question into a validated client-facing `PlacementQuestion` DTO,
   * computing remaining time, shuffling options, and calculating current exam progress metrics.
   *
   * @param question - Database question bank entity.
   * @param session - Current exam session state.
   * @returns Validated client-facing placement question.
   */
  async createPlacementQuestion(
    question: QuestionBank,
    session: ExamSession,
  ): Promise<PlacementQuestion> {
    const elapsedS = Math.floor((Date.now() - new Date(session.servedAt).getTime()) / 1000);
    const remainingS = Math.max(0, question.timeLimitS - Math.max(0, elapsedS));

    const totalQuestions = this.getMaxQuestionsRemaining(session);

    return PlacementQuestionSchema.parse({
      questionId: question.id,
      category: question.category,
      level: question.level,
      question: question.question,
      ...(question.readText ? { readText: question.readText } : {}),
      options: this.shuffleOptions(question.options, `${question.id}:${session.servedAt}`),
      timeLimitS: question.timeLimitS,
      remainingS,
      progress: {
        answered: session.totalAnswered,
        maxRemaining: totalQuestions,
      },
    });
  }

  /**
   * Retrieves a new question, records it in `UserSeenQuestion`, updates session state,
   * and returns the formatted question.
   *
   * @param userId - Unique identifier of the user.
   * @param examSession - Current mutable exam session state.
   * @returns Newly served client-facing placement question.
   */
  async getNewPlacementQuestion(
    userId: string,
    examSession: ExamSession,
  ): Promise<PlacementQuestion> {
    const [, question] = await this.getNewQuestion(userId, examSession);

    examSession.currentQuestionId = question.id;
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
