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

@Injectable()
export class PlacementProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: PlacementSessionService,
  ) {}

  async getQuestion(_questionId: string): Promise<QuestionBank> {
    const question = await this.prisma.questionBank.findUnique({
      where: { id: _questionId },
    });
    if (!question) {
      throw new NotFoundException('placement.notFound');
    }
    return question;
  }

  async updateUserLevel(_userId: string, _lang: Language, _level: TargetLevel) {
    await this.prisma.$transaction([
      this.prisma.userLevel.update({
        where: {
          userId_lang: {
            userId: _userId,
            lang: _lang,
          },
        },
        data: {
          level: _level,
        },
      }),
      this.prisma.user.update({
        where: { id: _userId },
        data: { activeLang: _lang },
      }),
    ]);
  }

  async adjustSessionFromAnswer(
    _answer: string | null,
    _question: QuestionBank,
    _session: ExamSession,
    _userId: string,
  ): Promise<void> {
    const isCorrect = _answer !== null && _answer === _question.answer;

    if (!isCorrect) {
      _session.mistakesPerLevel += 1;
    }

    let levelChange: 'down' | 'stay' | 'up' = 'stay';

    const loIndex = TARGET_LEVELS.indexOf(_session.lo);
    const hiIndex = TARGET_LEVELS.indexOf(_session.hi);
    const currIndex = TARGET_LEVELS.indexOf(_session.level);

    if (_session.mistakesPerLevel > PLACEMENT_ROUNDS.maxMistakes) {
      levelChange = 'down';
    } else {
      const askedInCurrentLevel = Object.values(_session.askedPerCategory).reduce(
        (sum, count) => sum + count,
        0,
      );
      if (askedInCurrentLevel + 1 >= MAX_QUESTIONS_PER_LEVEL) {
        levelChange = 'up';
      }
    }

    if (levelChange === 'stay') {
      _session.askedPerCategory[_question.category] =
        (_session.askedPerCategory[_question.category] ?? 0) + 1;
      return;
    } else if (levelChange === 'up' && currIndex === hiIndex - 1) {
      _session.level = _session.hi;
      _session.ended = true;
      await this.updateUserLevel(_userId, _session.lang, _session.level);
      return;
    } else if (levelChange === 'down' && currIndex === loIndex) {
      _session.level = _session.lo;
      _session.ended = true;
      await this.updateUserLevel(_userId, _session.lang, _session.level);
      return;
    }

    _session.askedPerCategory = { grammar: 0, vocabulary: 0, reading: 0 };
    _session.mistakesPerLevel = 0;

    if (levelChange === 'up') {
      _session.lo = TARGET_LEVELS[Math.min(hiIndex, currIndex + 1)];
      const nextIndex = Math.min(hiIndex - 1, currIndex + Math.ceil((hiIndex - currIndex) / 2));
      _session.level = TARGET_LEVELS[nextIndex];
    } else {
      _session.hi = _session.level;
      const nextIndex = Math.max(loIndex, currIndex - Math.ceil((currIndex - loIndex) / 2));
      _session.level = TARGET_LEVELS[nextIndex];
    }
  }

  hasTimedOut(question: QuestionBank, servedAt: string): boolean {
    const elapsedS = Math.floor((Date.now() - new Date(servedAt).getTime()) / 1000);
    return elapsedS >= question.timeLimitS;
  }

  async getResult(_userId: string, _session: ExamSession): Promise<PlacementResult | undefined> {
    if (!_session.ended) return undefined;

    const answers = await this.sessionService.getQuestionsAnswer(_userId);
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
      targetLevel: _session.level,
      report,
    });
  }
}
