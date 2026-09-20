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

  targetLevelToCEFRLevel(level: TargetLevel): Level {
    assert(level !== 'C3');
    return level;
  }

  async getNewQuestion(_userId: string, session: ExamSession): Promise<[number, QuestionBank]> {
    const eligibleCategories = QUESTION_CATEGORIES.filter(
      (cat) => (session.askedPerCategory[cat] ?? 0) < PLACEMENT_ROUNDS.perCategory,
    );

    const pool = eligibleCategories.length > 0 ? eligibleCategories : QUESTION_CATEGORIES;
    const shuffledPool = [...pool].sort(() => Math.random() - 0.5);

    let min_questions = Infinity;
    for (const cat of shuffledPool) {
      const questions = await this.prisma.questionBank.findMany({
        where: {
          lang: session.lang,
          level: this.targetLevelToCEFRLevel(session.level),
          category: cat,
          userSeenQuestions: {
            none: {
              userId: _userId,
            },
          },
        },
        take: LIMIT_UNSEEN_QUESTIONS_TO_RETRIEVE,
      });

      min_questions = Math.min(min_questions, questions.length);
      if (questions.length > 0) {
        return [min_questions, questions[0]];
      }
    }

    const recentSeen = await this.prisma.userSeenQuestion.findMany({
      where: {
        userId: _userId,
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

  getMaxQuestionsRemaining(_session: ExamSession): number {
    const askedInCurrentLevel = Object.values(_session.askedPerCategory).reduce(
      (sum, count) => sum + count,
      0,
    );
    const current_level_remaining = Math.max(0, MAX_QUESTIONS_PER_LEVEL - askedInCurrentLevel);

    const loIndex = Math.max(0, TARGET_LEVELS.indexOf(_session.lo));
    const hiIndex = Math.max(0, TARGET_LEVELS.indexOf(_session.hi));
    const levelIndex = Math.max(0, TARGET_LEVELS.indexOf(_session.level));

    const lowerDistance = Math.max(0, levelIndex - loIndex);
    const max_lower =
      lowerDistance > 0 ? (Math.floor(Math.log2(lowerDistance)) + 1) * MAX_QUESTIONS_PER_LEVEL : 0;

    const upperDistance = Math.max(0, hiIndex - levelIndex - 1);
    const max_upper =
      upperDistance > 0 ? (Math.floor(Math.log2(upperDistance)) + 1) * MAX_QUESTIONS_PER_LEVEL : 0;

    return Math.max(0, current_level_remaining + Math.max(max_lower, max_upper));
  }

  async createPlacementQuestion(
    _question: QuestionBank,
    _session: ExamSession,
  ): Promise<PlacementQuestion> {
    const elapsedS = Math.floor((Date.now() - new Date(_session.servedAt).getTime()) / 1000);
    const remainingS = Math.max(0, _question.timeLimitS - Math.max(0, elapsedS));

    const totalQuestions = this.getMaxQuestionsRemaining(_session);

    return PlacementQuestionSchema.parse({
      questionId: _question.id,
      category: _question.category,
      level: _question.level,
      question: _question.question,
      ...(_question.readText ? { readText: _question.readText } : {}),
      options: _question.options,
      timeLimitS: _question.timeLimitS,
      remainingS,
      progress: {
        answered: _session.totalAnswered,
        maxRemaining: totalQuestions,
      },
    });
  }

  async getNewPlacementQuestion(
    _userId: string,
    examSession: ExamSession,
  ): Promise<PlacementQuestion> {
    const [available, question] = await this.getNewQuestion(_userId, examSession);

    if (available < FETCH_NEW_QUESTIONS_FOR_CATEGORY_WHEN_REMAINING_LESS_THAN) {
      // todo for later PR: insert new questions into database, but asynchronously without user noticing
    }

    examSession.currentQuestionId = question.id;
    examSession.servedAt = new Date().toISOString();
    await this.prisma.userSeenQuestion.upsert({
      where: {
        userId_questionId: {
          userId: _userId,
          questionId: question.id,
        },
      },
      create: {
        userId: _userId,
        questionId: question.id,
      },
      update: {
        updatedAt: new Date(),
      },
    });
    await this.sessionService.saveExamSession(_userId, examSession);
    return this.createPlacementQuestion(question, examSession);
  }
}
