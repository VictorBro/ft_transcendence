import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ExamSession,
  TARGET_LEVELS,
  PlacementQuestion,
  PlacementQuestionSchema,
  PLACEMENT_ROUNDS,
  QUESTION_CATEGORIES,
  SubmitAnswerInput,
  SubmitAnswerSchema,
  PlacementResult,
} from '@ft/shared';

import assert from 'node:assert';

import { QuestionBank } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlacementSessionService } from './placement-session.service';
import { StartPlacementDto, SubmitAnswerDto } from './placement.dto';
import session from 'express-session';

export { PLACEMENT_REDIS_KEY_TTL } from './placement-session.service';
// we should preemptively generate questions, when a minimum amount is reached
export const FETCH_NEW_QUESTIONS_FOR_CATEGORY_WHEN_REMAINING_LESS_THAN = 6;
export const MAX_QUESTIONS_PER_LEVEL = 6;
export const START_LEVEL = 'B1';

@Injectable()
export class PlacementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: PlacementSessionService,
  ) {}

  async getNewQuestion(_userId: string, session: ExamSession): Promise<[number, QuestionBank]> {
    const eligibleCategories = QUESTION_CATEGORIES.filter(
      (cat) => (session.askedPerCategory[cat] ?? 0) < PLACEMENT_ROUNDS.perCategory,
    );

    const pool = eligibleCategories.length > 0 ? eligibleCategories : QUESTION_CATEGORIES;
    const cat = pool[Math.floor(Math.random() * pool.length)];

    const questions = await this.prisma.questionBank.findMany({
      where: {
        lang: session.lang,
        level: session.level,
        category: cat,
        userSeenQuestions: {
          none: {
            userId: _userId,
          },
        },
      },
    });

    if (questions.length === 0) {
      const recentSeen = await this.prisma.userSeenQuestion.findMany({
        where: {
          userId: _userId,
          questionBank: {
            lang: session.lang,
            level: session.level,
            category: cat,
          },
        },
        orderBy: {
          createdAt: 'desc',
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

    return [questions.length, questions[0]];
  }

  async getQuestion(_questionId: string): Promise<QuestionBank> {
    const question = await this.prisma.questionBank.findUnique({
      where: { id: _questionId },
    });
    if (!question) {
      throw new NotFoundException('placement.notFound');
    }
    return question;
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

    return Math.max(1, current_level_remaining + Math.max(max_lower, max_upper));
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
        answered: Object.values(_session.askedPerCategory).reduce((sum, count) => sum + count, 0),
        total: totalQuestions,
      },
    });
  }

  async startPlacement(_userId: string, _dto: StartPlacementDto): Promise<PlacementQuestion> {
    const existing = await this.sessionService.hasActiveSession(_userId);
    if (existing) {
      throw new ConflictException('placement.inProgress');
    }

    const examSession: ExamSession = {
      lang: _dto.lang,
      lo: 'A1',
      hi: 'C2+',
      level: START_LEVEL,
      mistakesPerLevel: 0,
      askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
      ended: false,
      currentQuestionId: null,
      servedAt: new Date().toISOString(),
    };

    return this.getNewPlacementQuestion(_userId, examSession);
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
    await this.prisma.userSeenQuestion.create({
      data: {
        userId: _userId,
        questionId: question.id,
      },
    });
    await this.sessionService.saveExamSession(_userId, examSession);

    const initialAnswer: SubmitAnswerInput = {
      questionId: examSession.currentQuestionId,
      choice: null,
    };
    await this.sessionService.archiveQuestionAnswer(
      _userId,
      SubmitAnswerSchema.parse(initialAnswer),
    );

    return this.createPlacementQuestion(question, examSession);
  }

  async adjustSessionFromAnswer(
    _answer: string | null,
    _question: QuestionBank,
    _session: ExamSession,
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
      return;
    } else if (levelChange === 'down' && currIndex === loIndex) {
      _session.level = _session.lo;
      _session.ended = true;
      return;
    }

    _session.askedPerCategory = { grammar: 0, vocabulary: 0, reading: 0 };
    _session.mistakesPerLevel = 0;

    if (levelChange === 'up') {
      _session.lo = TARGET_LEVELS(currIndex + 1);
      const nextIndex = Math.min(hiIndex - 1, currIndex + Math.ceil((hiIndex - currIndex) / 2));
      _session.level = TARGET_LEVELS[nextIndex];
    } else {
      _session.hi = _session.level;
      const nextIndex = Math.max(loIndex, currIndex - Math.ceil((currIndex - loIndex) / 2));
      _session.level = TARGET_LEVELS[nextIndex];
    }
  }

  async getTimeOut(
    _userId: string,
    question: QuestionBank,
    session: ExamSession,
  ): Promise<PlacementQuestion | PlacementResult> {
    const lastAnswer: SubmitAnswerInput = {
      questionId: question.id,
      choice: null,
    };
    await this.sessionService.archiveQuestionAnswer(_userId, SubmitAnswerSchema.parse(lastAnswer));
    await this.adjustSessionFromAnswer(lastAnswer.choice, question, session);
    const result = await this.getResult(_userId, session);
    if (result !== undefined) {
      return result;
    }
    return this.getNewPlacementQuestion(_userId, session);
  }

  hasTimedOut(question: QuestionBank, servedAt: string): boolean {
    const elapsedS = Math.floor((Date.now() - new Date(servedAt).getTime()) / 1000);
    return elapsedS >= question.timeLimitS;
  }

  async checkEndedOrTimedOut(
    _userId: string,
  ): Promise<
    [ExamSession, QuestionBank | undefined, PlacementQuestion | PlacementResult | undefined]
  > {
    const session = await this.sessionService.loadExamSession(_userId);
    if (!session || !session.currentQuestionId) {
      throw new NotFoundException('placement.notFound');
    }

    let result = await this.getResult(_userId, session);
    if (result !== undefined) {
      return [session, undefined, result];
    }

    const question = await this.getQuestion(session.currentQuestionId);
    if (this.hasTimedOut(question, session.servedAt)) {
      const lastAnswer: SubmitAnswerInput = {
        questionId: question.id,
        choice: null,
      };
      await this.sessionService.archiveQuestionAnswer(
        _userId,
        SubmitAnswerSchema.parse(lastAnswer),
      );
      await this.adjustSessionFromAnswer(lastAnswer.choice, question, session);
      result = await this.getResult(_userId, session);
      if (result !== undefined) {
        return [session, question, result];
      }
      return [session, question, await this.getNewPlacementQuestion(_userId, session)];
    }
    return [session, question, undefined];
  }

  async getPlacement(_userId: string): Promise<PlacementQuestion | PlacementResult> {
    const [session, question, result] = await this.checkEndedOrTimedOut(_userId);
    if (result !== undefined) return result;
    assert(question !== undefined);
    return this.createPlacementQuestion(question, session);
  }

  async getResult(_userId: string, _session: ExamSession): Promise<PlacementResult | undefined> {
    return undefined;
  }

  async submitAnswer(
    _userId: string,
    _dto: SubmitAnswerDto,
  ): Promise<PlacementQuestion | PlacementResult> {
    const [session, question, result] = await this.checkEndedOrTimedOut(_userId);
    if (result !== undefined) return result;
    assert(question !== undefined);

    if (_dto.questionId !== session.currentQuestionId) {
      return this.getPlacement(_userId);
    }

    await this.sessionService.archiveQuestionAnswer(_userId, _dto);
    await this.adjustSessionFromAnswer(_dto.choice, question, session);

    const result_user_answer = await this.getResult(_userId, session);
    if (result_user_answer !== undefined) {
      return result_user_answer;
    }

    return this.getNewPlacementQuestion(_userId, session);
  }

  async quitPlacement(_userId: string): Promise<void> {
    await this.sessionService.deleteSession(_userId);
  }
}
