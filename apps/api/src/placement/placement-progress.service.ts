import { Injectable, NotFoundException } from '@nestjs/common';
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

  async getQuestion(questionId: string): Promise<QuestionBank> {
    const question = await this.prisma.questionBank.findUnique({
      where: { id: questionId },
    });
    if (!question) {
      throw new NotFoundException('placement.notFound');
    }
    return question;
  }

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

  async adjustSessionFromAnswer(
    answer: string | null,
    question: QuestionBank,
    session: ExamSession,
    userId: string,
  ): Promise<void> {
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

    if (levelChange === 'stay') {
      session.askedPerCategory[question.category] =
        (session.askedPerCategory[question.category] ?? 0) + 1;
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

  hasTimedOut(question: QuestionBank, servedAt: string): boolean {
    const elapsedS = Math.floor((Date.now() - new Date(servedAt).getTime()) / 1000);
    return elapsedS >= question.timeLimitS + NETWORK_GRACE_S;
  }

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
