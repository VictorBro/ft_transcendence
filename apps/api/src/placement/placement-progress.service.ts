import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ExamSession,
  Language,
  PLACEMENT_ROUNDS,
  PlacementReportEntry,
  PlacementResult,
  PlacementResultSchema,
  TargetLevel,
  TARGET_LEVELS,
} from '@ft/shared';

import { QuestionBank } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlacementSessionService } from './placement-session.service';
import { MAX_QUESTIONS_PER_LEVEL } from './placement-question.service';

export const NETWORK_GRACE_S = 3;

@Injectable()
export class PlacementProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: PlacementSessionService,
  ) {}

  /**
   * Retrieves a question by its unique identifier from the database question bank.
   *
   * @param questionId - Unique ID of the question to retrieve.
   * @returns The corresponding question bank entity.
   * @throws NotFoundException If no question matches the given ID (`placement.notFound`).
   */
  async getQuestion(questionId: string): Promise<QuestionBank> {
    const question = await this.prisma.questionBank.findUnique({
      where: { id: questionId },
    });
    if (!question) {
      throw new NotFoundException('placement.notFound');
    }
    return question;
  }

  /**
   * Persists the determined target level and updates the user's active language
   * within an atomic database transaction.
   *
   * @param userId - Unique identifier of the user.
   * @param lang - Target language of the placement exam.
   * @param level - Determined CEFR target level to store.
   * @returns Promise resolving when the transaction finishes.
   */
  async updateUserLevel(userId: string, lang: Language, level: TargetLevel): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.userLevel.update({
        where: {
          userId_lang: {
            userId,
            lang,
          },
        },
        data: {
          level,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { activeLang: lang },
      }),
    ]);
  }

  /**
   * Checks whether onboarding is completed for a user in a specific language
   * by verifying the existence of a corresponding `UserLevel` record in the database.
   *
   * @param userId - Unique identifier of the user.
   * @param lang - Target language to verify onboarding for.
   * @returns `true` if onboarding has been completed; otherwise `false`.
   */
  async checkOnboardingCompleted(userId: string, lang: Language): Promise<boolean> {
    const userLevel = await this.prisma.userLevel.findUnique({
      where: {
        userId_lang: {
          userId,
          lang,
        },
      },
      select: { id: true },
    });
    return userLevel !== null;
  }

  /**
   * Evaluates an answer and updates the adaptive placement session state.
   * Tracks mistakes and category counts, applies binary search level adjustments,
   * and upon reaching a terminal boundary, marks the exam as ended and updates the user level.
   *
   * @param answer - User's chosen option string, or `null` if timed out.
   * @param question - The question bank entity that was answered.
   * @param session - Current mutable exam session state.
   * @param userId - Unique identifier of the user.
   * @returns Promise resolving when session state adjustments and any terminal updates complete.
   */
  async adjustSessionFromAnswer(
    answer: string | null,
    question: QuestionBank,
    session: ExamSession,
    userId: string,
  ): Promise<void> {
    if (answer !== null && !question.options.includes(answer)) {
      throw new BadRequestException('placement.invalidChoice');
    }

    const isCorrect = answer !== null && answer === question.answer;

    if (!isCorrect) {
      session.mistakesPerLevel += 1;
    }

    let levelChange: 'down' | 'stay' | 'up' = 'stay';

    const loIndex = TARGET_LEVELS.indexOf(session.lo);
    const hiIndex = TARGET_LEVELS.indexOf(session.hi);
    const currIndex = TARGET_LEVELS.indexOf(session.level);

    if (session.mistakesPerLevel > PLACEMENT_ROUNDS.maxMistakes) {
      levelChange = 'down';
    } else {
      const askedInCurrentLevel = Object.values(session.askedPerCategory).reduce(
        (sum, count) => sum + count,
        0,
      );
      if (askedInCurrentLevel + 1 >= MAX_QUESTIONS_PER_LEVEL) {
        levelChange = 'up';
      }
    }

    session.askedPerCategory[question.category] =
      (session.askedPerCategory[question.category] ?? 0) + 1;
    if (levelChange === 'stay') {
      return;
    } else if (levelChange === 'up' && currIndex === hiIndex - 1) {
      session.level = session.hi;
      session.ended = true;
      await this.updateUserLevel(userId, session.lang, session.level);
      return;
    } else if (levelChange === 'down' && currIndex === loIndex) {
      session.level = session.lo;
      session.ended = true;
      await this.updateUserLevel(userId, session.lang, session.level);
      return;
    }

    session.askedPerCategory = { grammar: 0, vocabulary: 0, reading: 0 };
    session.mistakesPerLevel = 0;

    if (levelChange === 'up') {
      session.lo = TARGET_LEVELS[Math.min(hiIndex, currIndex + 1)];
      const nextIndex = Math.min(hiIndex - 1, currIndex + Math.ceil((hiIndex - currIndex) / 2));
      session.level = TARGET_LEVELS[nextIndex];
    } else {
      session.hi = session.level;
      const nextIndex = Math.max(loIndex, currIndex - Math.ceil((currIndex - loIndex) / 2));
      session.level = TARGET_LEVELS[nextIndex];
    }
  }

  /**
   * Determines whether the question has exceeded its allowed time limit,
   * accounting for network latency grace period (`NETWORK_GRACE_S`).
   *
   * @param question - Question bank entity containing `timeLimitS`.
   * @param servedAt - ISO timestamp string of when the question was served.
   * @returns `true` if the elapsed duration meets or exceeds `timeLimitS + NETWORK_GRACE_S`; otherwise `false`.
   */
  hasTimedOut(question: QuestionBank, servedAt: string): boolean {
    const elapsedS = Math.floor((Date.now() - new Date(servedAt).getTime()) / 1000);
    return elapsedS >= question.timeLimitS + NETWORK_GRACE_S;
  }

  /**
   * Compiles the final placement result and detailed report if the exam has ended.
   * Retrieves answered questions and builds a comparison of submitted vs correct answers.
   *
   * @param userId - Unique identifier of the user.
   * @param session - Current exam session state.
   * @returns Parsed `PlacementResult` if the session ended, or `undefined` if still active.
   */
  async getResult(userId: string, session: ExamSession): Promise<PlacementResult | undefined> {
    if (!session.ended) return undefined;

    const answers = await this.sessionService.getQuestionAnswers(userId);
    const questionIds = answers.map((answer) => answer.questionId);
    const dbQuestions = await this.prisma.questionBank.findMany({
      where: {
        id: { in: questionIds },
      },
    });

    const questionsMap = new Map(dbQuestions.map((q) => [q.id, q]));
    const report: PlacementReportEntry[] = [];

    for (const answer of answers) {
      const question = questionsMap.get(answer.questionId);
      if (question) {
        report.push({
          questionId: question.id,
          question: question.question,
          options: question.options,
          chosen: answer.choice,
          correct: question.answer,
          wasCorrect: answer.choice !== null && answer.choice === question.answer,
        });
      }
    }

    return PlacementResultSchema.parse({
      targetLevel: session.level,
      report,
    });
  }
}
