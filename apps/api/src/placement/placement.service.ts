import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ExamSession,
  ExamSessionSchema,
  LEVELS,
  PlacementQuestion,
  PlacementQuestionSchema,
  PLACEMENT_ROUNDS,
  QUESTION_CATEGORIES,
  SubmitAnswerInput,
  SubmitAnswerSchema,
  PlacementResult,
} from '@ft/shared';

import { QuestionBank } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StartPlacementDto, SubmitAnswerDto } from './placement.dto';

export const PLACEMENT_REDIS_KEY_TTL = 3600;
export const FETCH_NEW_QUESTIONS_FOR_CATEGORY_WHEN_REMAINING_LESS_THAN = 6;
export const MAX_QUESTIONS_PER_LEVEL = 6;
export const START_LEVEL = 'B1';

@Injectable()
export class PlacementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private evalKey(userId: string): string {
    return `user:${userId}:eval`;
  }

  private evalQuestionsKey(userId: string): string {
    return `user:${userId}:eval_questions`;
  }

  async saveExamSession(userId: string, session: ExamSession): Promise<void> {
    const key = this.evalKey(userId);
    await this.redis.client.hSet(key, {
      lang: session.lang,
      lo: session.lo,
      hi: session.hi,
      level: session.level,
      mistakesPerLevel: session.mistakesPerLevel.toString(),
      askedPerCategory: JSON.stringify(session.askedPerCategory),
      total_asked: session.total_asked.toString(),
      currentQuestionId: session.currentQuestionId ?? '',
      servedAt: session.servedAt,
    });
    await this.redis.client.expire(key, PLACEMENT_REDIS_KEY_TTL);
  }

  async loadExamSession(userId: string): Promise<ExamSession | null> {
    const key = this.evalKey(userId);
    const data = await this.redis.client.hGetAll(key);
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    return ExamSessionSchema.parse({
      lang: data.lang,
      lo: data.lo,
      hi: data.hi,
      level: data.level,
      mistakesPerLevel: Number(data.mistakesPerLevel),
      askedPerCategory: JSON.parse(data.askedPerCategory || '{}'),
      total_asked: Number(data.total_asked ?? 0),
      currentQuestionId: data.currentQuestionId ? data.currentQuestionId : null,
      servedAt: data.servedAt,
    });
  }

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
      throw new NotFoundException('placement.poolExhausted');
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

    const loIndex = Math.max(0, LEVELS.indexOf(_session.lo));
    const hiIndex = Math.max(0, LEVELS.indexOf(_session.hi));
    const levelIndex = Math.max(0, LEVELS.indexOf(_session.level));

    const lowerDistance = Math.max(0, levelIndex - loIndex);
    const max_lower =
      lowerDistance > 0 ? (Math.floor(Math.log2(lowerDistance)) + 1) * MAX_QUESTIONS_PER_LEVEL : 0;

    const upperDistance = Math.max(0, hiIndex - levelIndex);
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
        answered: _session.total_asked,
        total: totalQuestions,
      },
    });
  }

  async startPlacement(_userId: string, _dto: StartPlacementDto): Promise<PlacementQuestion> {
    const existing = await this.redis.client.exists(this.evalKey(_userId));
    if (existing) {
      throw new ConflictException('placement.inProgress');
    }

    const examSession: ExamSession = {
      lang: _dto.lang,
      lo: 'A1',
      hi: 'C2',
      level: START_LEVEL,
      mistakesPerLevel: 0,
      askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
      total_asked: 0,
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
      // todo for later PR: insert new questions into database
    }

    examSession.currentQuestionId = question.id;
    examSession.servedAt = new Date().toISOString();
    await this.prisma.userSeenQuestion.create({
      data: {
        userId: _userId,
        questionId: question.id,
      },
    });
    await this.saveExamSession(_userId, examSession);

    const initialAnswer: SubmitAnswerInput = {
      questionId: examSession.currentQuestionId,
      choice: null,
    };
    await this.archiveQuestionAnswer(_userId, SubmitAnswerSchema.parse(initialAnswer));

    return this.createPlacementQuestion(question, examSession);
  }

  async archiveQuestionAnswer(_userId: string, answer: SubmitAnswerInput): Promise<void> {
    const questionsSetKey = this.evalQuestionsKey(_userId);

    await this.redis.client.sAdd(questionsSetKey, JSON.stringify(answer));
    await this.redis.client.expire(questionsSetKey, PLACEMENT_REDIS_KEY_TTL);
  }

  async adjustSessionFromAnswer(
    _answer: string | null,
    _question: QuestionBank,
    _session: ExamSession,
  ): Promise<void> {
    // correct: Bool = _answer ? (_answer = _question.correctAnswer) : False
    const isCorrect = _answer !== null && _answer === _question.answer;
    // !correct ? _session.mistakesPerLevel += 1
    if (!isCorrect) {
      _session.mistakesPerLevel += 1;
    }

    // enum LevelChange = {down, stay, up}
    //levelChange = stay
    let levelChange: 'down' | 'stay' | 'up' = 'stay';
    // if (_session.mistakesPerLevel === 2) {
    //   levelChange = down
    // } else {
    //   numberAnsweredThisLevel = sum(_session.askedPerCategory)
    //   numberAnswered === MAX_QUESTIONS_PER_LEVEL ? levelchange = up
    // }
    if (_session.mistakesPerLevel >= 2) {
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

    // if (levelChange == stay) || (leveChange == up && _session.level == _session.hi) || (levelChange == down && _session.level == _session.lo)
    // {
    //    _session.askedPerCategory[_question.category] += 1
    // return;
    // }
    if (
      levelChange === 'stay' ||
      (levelChange === 'up' && _session.level === _session.hi) ||
      (levelChange === 'down' && _session.level === _session.lo)
    ) {
      _session.askedPerCategory[_question.category] =
        (_session.askedPerCategory[_question.category] ?? 0) + 1;
      _session.total_asked += 1;
      return;
    }

    // _session.askedPerCategory = {};
    // session.mistakesPerLevel = 0;
    // tempLevel = _session.level;
    // if (levelChange == up) {
    //   __session.level = LEVELS.indexOf(floor(_session.hi - _session.level) )
    //   _session.lo = tempLevel
    // } else {
    //   __session.level = LEVELS.indexOf(floor(_session.level - _session.low) )
    //   _session.hi = tempLevel
    // }
    _session.askedPerCategory = { grammar: 0, vocabulary: 0, reading: 0 };
    _session.mistakesPerLevel = 0;
    _session.total_asked += 1;

    const tempLevel = _session.level;
    const loIndex = LEVELS.indexOf(_session.lo);
    const hiIndex = LEVELS.indexOf(_session.hi);
    const currIndex = LEVELS.indexOf(_session.level);

    if (levelChange === 'up') {
      _session.lo = tempLevel;
      const nextIndex = Math.min(hiIndex, currIndex + Math.ceil((hiIndex - currIndex) / 2));
      _session.level = LEVELS[nextIndex];
    } else {
      _session.hi = tempLevel;
      const nextIndex = Math.max(loIndex, currIndex - Math.ceil((currIndex - loIndex) / 2));
      _session.level = LEVELS[nextIndex];
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
    await this.archiveQuestionAnswer(_userId, SubmitAnswerSchema.parse(lastAnswer));
    await this.adjustSessionFromAnswer(null, question, session);
    const result = await this.getResult(_userId, session);
    if (result !== undefined) {
      return result;
    }
    return this.getNewPlacementQuestion(_userId, session);
  }

  async getPlacement(_userId: string): Promise<PlacementQuestion | PlacementResult> {
    const session = await this.loadExamSession(_userId);
    if (!session || !session.currentQuestionId) {
      throw new NotFoundException('placement.notFound');
    }

    const question = await this.getQuestion(session.currentQuestionId);
    const elapsedS = Math.floor((Date.now() - new Date(session.servedAt).getTime()) / 1000);
    if (elapsedS < question.timeLimitS) {
      return this.createPlacementQuestion(question, session);
    }
    return this.getTimeOut(_userId, question, session);
  }

  async getResult(_userId: string, _session: ExamSession): Promise<PlacementResult | undefined> {
    return undefined;
  }

  async submitAnswer(
    _userId: string,
    _dto: SubmitAnswerDto,
  ): Promise<PlacementQuestion | PlacementResult> {
    const session = await this.loadExamSession(_userId);
    if (!session || !session.currentQuestionId) {
      throw new NotFoundException('placement.notFound');
    }

    const question = await this.getQuestion(session.currentQuestionId);
    if (_dto.questionId !== session.currentQuestionId) {
      return this.getPlacement(_userId);
    }

    const elapsedS = Math.floor((Date.now() - new Date(session.servedAt).getTime()) / 1000);
    if (elapsedS >= question.timeLimitS) {
      return this.getTimeOut(_userId, question, session);
    }

    await this.archiveQuestionAnswer(_userId, _dto);
    await this.adjustSessionFromAnswer(_dto.choice, question, session);

    const result = await this.getResult(_userId, session);
    if (result !== undefined) {
      return result;
    }

    return this.getNewPlacementQuestion(_userId, session);
  }

  async quitPlacement(_userId: string): Promise<void> {
    await this.redis.client.del([this.evalKey(_userId), this.evalQuestionsKey(_userId)]);
  }
}
