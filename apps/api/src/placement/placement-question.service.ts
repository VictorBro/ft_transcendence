import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ExamSession,
  TARGET_LEVELS,
  PlacementQuestion,
  PlacementQuestionSchema,
  PLACEMENT_ROUNDS,
  QUESTION_CATEGORIES,
  TargetLevel,
} from '@ft/shared';
import assert from 'node:assert';

import { Level, QuestionBank } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlacementSessionService } from './placement-session.service';

export const FETCH_NEW_QUESTIONS_FOR_CATEGORY_WHEN_REMAINING_LESS_THAN = 6;
export const LIMIT_UNSEEN_QUESTIONS_TO_RETRIEVE = Math.max(
  100,
  FETCH_NEW_QUESTIONS_FOR_CATEGORY_WHEN_REMAINING_LESS_THAN,
);
export const MAX_QUESTIONS_PER_LEVEL = 6;

@Injectable()
export class PlacementQuestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: PlacementSessionService,
  ) {}

  /**
   * Converts a placement `TargetLevel` to a database CEFR `Level`.
   * Asserts that the level is not `'C3'`, as question bank items span up to `'C2'`.
   *
   * @param level - Placement target level to convert.
   * @returns Corresponding database CEFR `Level`.
   */
  targetLevelToCEFRLevel(level: TargetLevel): Level {
    assert(level !== 'C3');
    return level;
  }

  /**
   * Retrieves a new question for the user's current level, balancing question categories.
   * Prioritizes randomly selected unseen questions from the question bank and falls back to
   * least-recently-seen questions not yet served in the current session when the unseen pool is exhausted.
   *
   * @param userId - Unique identifier of the user.
   * @param session - Current exam session state.
   * @returns A tuple `[minQuestions, question]` containing available count and the chosen question.
   * @throws NotFoundException If no questions exist in the pool for this level (`placement.poolExhausted`).
   */
  async getNewQuestion(userId: string, session: ExamSession): Promise<[number, QuestionBank]> {
    const eligibleCategories = QUESTION_CATEGORIES.filter(
      (cat) => (session.askedPerCategory[cat] ?? 0) < PLACEMENT_ROUNDS.perCategory,
    );

    const pool = eligibleCategories.length > 0 ? eligibleCategories : QUESTION_CATEGORIES;

    let min_questions = Infinity;
    const availableCategoryQuestions: QuestionBank[][] = [];

    for (const cat of pool) {
      const questions = await this.prisma.questionBank.findMany({
        where: {
          lang: session.lang,
          level: this.targetLevelToCEFRLevel(session.level),
          category: cat,
          userSeenQuestions: {
            none: {
              userId,
            },
          },
        },
        take: LIMIT_UNSEEN_QUESTIONS_TO_RETRIEVE,
      });

      min_questions = Math.min(min_questions, questions.length);
      if (questions.length > 0) {
        availableCategoryQuestions.push(questions);
      }
    }

    if (availableCategoryQuestions.length > 0) {
      const randomCategoryIndex = Math.floor(Math.random() * availableCategoryQuestions.length);
      const chosenCategoryQuestions = availableCategoryQuestions[randomCategoryIndex];
      const randomQuestionIndex = Math.floor(Math.random() * chosenCategoryQuestions.length);
      return [min_questions, chosenCategoryQuestions[randomQuestionIndex]];
    }

    const answers = await this.sessionService.getQuestionAnswers(userId);
    const excludeQuestionIds = answers.map((answer) => answer.questionId);
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
          level: this.targetLevelToCEFRLevel(session.level),
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
    return [0, randomSeen.questionBank];
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

    const loIndex = Math.max(0, TARGET_LEVELS.indexOf(session.lo));
    const hiIndex = Math.max(0, TARGET_LEVELS.indexOf(session.hi));
    const levelIndex = Math.max(0, TARGET_LEVELS.indexOf(session.level));

    const lowerDistance = Math.max(0, levelIndex - loIndex);
    const max_lower =
      lowerDistance > 0 ? (Math.floor(Math.log2(lowerDistance)) + 1) * MAX_QUESTIONS_PER_LEVEL : 0;

    const upperDistance = Math.max(0, hiIndex - levelIndex - 1);
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
   * persists the session to Redis, and returns the formatted question.
   *
   * @param userId - Unique identifier of the user.
   * @param examSession - Current mutable exam session state.
   * @returns Newly served client-facing placement question.
   */
  async getNewPlacementQuestion(
    userId: string,
    examSession: ExamSession,
  ): Promise<PlacementQuestion> {
    const [available, question] = await this.getNewQuestion(userId, examSession);

    if (available < FETCH_NEW_QUESTIONS_FOR_CATEGORY_WHEN_REMAINING_LESS_THAN) {
      // todo for later PR: insert new questions into database, but asynchronously without user noticing
    }

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
    await this.sessionService.saveExamSession(userId, examSession);
    return this.createPlacementQuestion(question, examSession);
  }
}
