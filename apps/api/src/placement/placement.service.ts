import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ExamSession,
  ExamSessionSchema,
  PlacementQuestion,
  PlacementQuestionSchema,
  PLACEMENT_ROUNDS,
  QUESTION_CATEGORIES,
} from '@ft/shared';

import { QuestionBank } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StartPlacementDto, SubmitAnswerDto } from './placement.dto';

export const PLACEMENT_REDIS_KEY_TTL = 3600;
export const FETCH_NEW_QUESTIONS_FOR_CATEGORY_WHEN_REMAINING_LESS_THAN = 6;

@Injectable()
export class PlacementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private evalKey(userId: string): string {
    return `session:${userId}:eval`;
  }

  private evalQuestionsKey(userId: string): string {
    return `session:${userId}:eval_questions`;
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
    // get random cat = QuestionCategory which in session.askedPerCategory value < 2
    const eligibleCategories = QUESTION_CATEGORIES.filter(
      (cat) => (session.askedPerCategory[cat] ?? 0) < PLACEMENT_ROUNDS.perCategory,
    );

    const pool = eligibleCategories.length > 0 ? eligibleCategories : QUESTION_CATEGORIES;
    const cat = pool[Math.floor(Math.random() * pool.length)];

    // get prisma.questionbank[], where category = cat and Join with model UserSeenQuestion where user.id = _userId and questionID = NULL
    const inExam = await this.redis.client.sMembers(this.evalQuestionsKey(_userId));

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
        ...(inExam.length > 0 ? { id: { notIn: inExam } } : {}),
      },
    });

    if (questions.length === 0) {
      throw new NotFoundException('placement.poolExhausted');
    }

    // return new Set(count(questionbank[], first_of[questionbank]))
    return [questions.length, questions[0]];
  }

  async getQuestion(_questionId: string): Promise<QuestionBank> {
    // question = prisma.questionbank.findUnique where id = _questionID
    // return question
    const question = await this.prisma.questionBank.findUnique({
      where: { id: _questionId },
    });
    if (!question) {
      throw new NotFoundException('placement.notFound');
    }
    return question;
  }

  async createPlacementQuestion(
    _question: QuestionBank,
    _session: ExamSession,
  ): Promise<PlacementQuestion> {
    // construct and return new PlacementQuestion from QuestionBank and ExamSession
    const elapsedS = Math.floor((Date.now() - new Date(_session.servedAt).getTime()) / 1000);
    const remainingS = Math.max(0, _question.timeLimitS - Math.max(0, elapsedS));

    const totalQuestions = QUESTION_CATEGORIES.length * PLACEMENT_ROUNDS.perCategory;

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
    // create examSession = ExamSession with lang = _dto.lang, lo = A1, hi = C2, level = B1, mistakesPerLevel = 0, askedPerCategory empty, total_asked = 0, currentQuestionID = null, servedAt = now())
    const existing = await this.redis.client.exists(this.evalKey(_userId));
    if (existing) {
      throw new ConflictException('placement.inProgress');
    }

    const examSession: ExamSession = {
      lang: _dto.lang,
      lo: 'A1',
      hi: 'C2',
      level: 'B1',
      mistakesPerLevel: 0,
      askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
      total_asked: 0,
      currentQuestionId: null,
      servedAt: new Date().toISOString(),
    };

    // question = getQuestion(examSession)
    const [, question] = await this.getNewQuestion(_userId, examSession);

    // examSession.currentQuestionId = question.id
    examSession.currentQuestionId = question.id;
    examSession.servedAt = new Date().toISOString();

    // create redis hash session:{$session_id}:eval, ttl:PLACEMENT_REDIS_KEY_TTL. the hash stores all info from examsession and it must be able to recreate an Exam session object from it, if makes sens, create a helper function to store examsession in hash
    await this.saveExamSession(_userId, examSession);

    // create redis set session:{$session_id}:eval_questions, ttl: PLACEMENT_REDIS_KEY_TTL
    const questionsSetKey = this.evalQuestionsKey(_userId);
    await this.redis.client.sAdd(questionsSetKey, question.id);
    await this.redis.client.expire(questionsSetKey, PLACEMENT_REDIS_KEY_TTL);

    // return createPlacmeentQuestion(question, examSession)
    return this.createPlacementQuestion(question, examSession);
  }

  async getPlacement(_userId: string): Promise<PlacementQuestion> {
    // examSession = ExamSession create from redis hash session:{$session_id}:eval
    const session = await this.loadExamSession(_userId);
    if (!session || !session.currentQuestionId) {
      throw new NotFoundException('placement.notFound');
    }

    // question = getQuestion(session.currentQuestionId)
    const question = await this.getQuestion(session.currentQuestionId);

    // return createPlacmeentQuestion(question, examSession)
    return this.createPlacementQuestion(question, session);
  }

  async submitAnswer(_userId: string, _dto: SubmitAnswerDto) {}

  async quitPlacement(_userId: string): Promise<void> {
    // erase redis keys:
    // redis hash session:{$session_id}:eval
    // redis set session:{$session_id}:eval_questions
    await this.redis.client.del([this.evalKey(_userId), this.evalQuestionsKey(_userId)]);
  }
}
