import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  LEVELS,
  PLACEMENT_ROUNDS,
  PlacementReportEntry,
  PlacementResult,
  PlacementResultSchema,
} from '@ft/shared';

import { ExamSession } from './placement.schema';

import { QuestionBank } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_QUESTIONS_PER_LEVEL } from './placement-question.service';

export const NETWORK_GRACE_S = 2;

@Injectable()
export class PlacementProgressService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves a question by its unique identifier from the database question bank.
   *
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
   * Evaluates an answer and updates the adaptive placement session state.
   * Tracks mistakes and category counts, applies binary search level adjustments,
   * and upon reaching a terminal boundary, marks the exam as ended.
   *
   * @throws ConflictException If session level is null (`placement.invalidSession`).
   */
  adjustSessionFromAnswer(
    answer: string | null,
    question: QuestionBank,
    session: ExamSession,
  ): void {
    if (session.level === null) {
      throw new ConflictException('placement.invalidSession');
    }

    const isCorrect = answer !== null && answer === question.answer;

    if (!isCorrect) {
      session.mistakesPerLevel += 1;
    }

    let levelChange: 'down' | 'stay' | 'up' = 'stay';

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
    } else if (levelChange === 'up' && session.level === session.hi - 1) {
      session.level = session.hi;
      session.ended = true;
      return;
    } else if (levelChange === 'down' && session.level === session.lo) {
      session.level = session.lo;
      session.ended = true;
      return;
    }

    session.askedPerCategory = { grammar: 0, vocabulary: 0, reading: 0 };
    session.mistakesPerLevel = 0;

    if (levelChange === 'up') {
      session.lo = Math.min(session.hi, session.level + 1);
      const nextIndex = Math.min(
        session.hi - 1,
        session.level + Math.ceil((session.hi - session.level) / 2),
      );
      session.level = nextIndex;
    } else {
      session.hi = session.level;
      const nextIndex = Math.max(
        session.lo,
        session.level - Math.ceil((session.level - session.lo) / 2),
      );
      session.level = nextIndex;
    }
  }

  /**
   * Determines whether the question has exceeded its allowed time limit,
   * accounting for network latency grace period (`NETWORK_GRACE_S`).
   */
  hasTimedOut(question: QuestionBank, servedAt: string): boolean {
    const elapsedS = Math.floor((Date.now() - new Date(servedAt).getTime()) / 1000);
    return elapsedS >= question.timeLimitS + NETWORK_GRACE_S;
  }

  /**
   * Compiles the final placement result and detailed report if the exam has ended.
   * Retrieves answered questions and builds a comparison of submitted vs correct answers.
   * `applied` is false when every answer timed out, which tells the caller to leave the course alone.
   *
   * @throws ConflictException If an ended session has no level (`placement.invalidSession`).
   */
  async getResult(session: ExamSession): Promise<PlacementResult | undefined> {
    if (!session.ended) return undefined;
    if (session.level === null) {
      throw new ConflictException('placement.invalidSession');
    }

    const questionIds = session.answers.map((answer) => answer.questionId);
    const dbQuestions = await this.prisma.questionBank.findMany({
      where: {
        id: { in: questionIds },
      },
    });

    const questionsMap = new Map(dbQuestions.map((q) => [q.id, q]));
    const report: PlacementReportEntry[] = [];

    for (const answer of session.answers) {
      const question = questionsMap.get(answer.questionId);
      if (question) {
        report.push({
          questionId: question.id,
          level: question.level,
          question: question.question,
          ...(question.readText ? { readText: question.readText } : {}),
          options: question.options,
          chosen: answer.choice,
          correct: question.answer,
          wasCorrect: answer.choice !== null && answer.choice === question.answer,
        });
      }
    }

    return PlacementResultSchema.parse({
      lang: session.lang,
      targetLevel: LEVELS[Math.max(0, Math.min(session.level, LEVELS.length - 1))],
      // A learner who walked away from the run measured nothing.
      applied: session.answers.some((answer) => answer.choice !== null),
      report,
    });
  }
}
