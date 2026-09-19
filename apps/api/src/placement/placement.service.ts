import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ExamSession,
  PlacementQuestion,
  PlacementResult,
  SubmitAnswerInput,
  SubmitAnswerSchema,
} from '@ft/shared';
import assert from 'node:assert';

import { QuestionBank } from '../generated/prisma/client';
import { PlacementSessionService } from './placement-session.service';
import { PlacementQuestionService } from './placement-question.service';
import { PlacementProgressService } from './placement-progress.service';
import { StartPlacementDto, SubmitAnswerDto } from './placement.dto';

export { PLACEMENT_REDIS_KEY_TTL } from './placement-session.service';
export {
  FETCH_NEW_QUESTIONS_FOR_CATEGORY_WHEN_REMAINING_LESS_THAN,
  MAX_QUESTIONS_PER_LEVEL,
} from './placement-question.service';
export { NETWORK_GRACE_S } from './placement-progress.service';
export const START_LEVEL = 'B1';

@Injectable()
export class PlacementService {
  constructor(
    private readonly sessionService: PlacementSessionService,
    private readonly questionService: PlacementQuestionService,
    private readonly progressService: PlacementProgressService,
  ) {}

  async getTimeOut(
    userId: string,
    question: QuestionBank,
    session: ExamSession,
  ): Promise<PlacementQuestion | PlacementResult> {
    const lastAnswer: SubmitAnswerInput = {
      questionId: question.id,
      choice: null,
    };
    await this.sessionService.archiveQuestionAnswer(userId, SubmitAnswerSchema.parse(lastAnswer));
    session.totalAnswered += 1;
    await this.progressService.adjustSessionFromAnswer(
      lastAnswer.choice,
      question,
      session,
      userId,
    );
    await this.sessionService.saveExamSession(userId, session);
    const result = await this.progressService.getResult(userId, session);
    if (result !== undefined) {
      return result;
    }
    return this.questionService.getNewPlacementQuestion(userId, session);
  }

  async checkEndedOrTimedOut(
    userId: string,
  ): Promise<
    [ExamSession, QuestionBank | undefined, PlacementQuestion | PlacementResult | undefined]
  > {
    const session = await this.sessionService.loadExamSession(userId);
    if (!session || !session.currentQuestionId) {
      throw new NotFoundException('placement.notFound');
    }

    const result = await this.progressService.getResult(userId, session);
    if (result !== undefined) {
      return [session, undefined, result];
    }

    const question = await this.progressService.getQuestion(session.currentQuestionId);
    if (this.progressService.hasTimedOut(question, session.servedAt)) {
      const timedOutResult = await this.getTimeOut(userId, question, session);
      return [session, question, timedOutResult];
    }
    return [session, question, undefined];
  }

  async startPlacement(userId: string, dto: StartPlacementDto): Promise<PlacementQuestion> {
    const existing = await this.sessionService.hasActiveSession(userId);
    if (existing) {
      throw new ConflictException('placement.inProgress');
    }

    const examSession: ExamSession = {
      lang: dto.lang,
      lo: 'A1',
      hi: 'C3',
      level: START_LEVEL,
      mistakesPerLevel: 0,
      askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
      totalAnswered: 0,
      ended: false,
      currentQuestionId: null,
      servedAt: new Date().toISOString(),
    };

    return this.questionService.getNewPlacementQuestion(userId, examSession);
  }

  async getPlacement(userId: string): Promise<PlacementQuestion | PlacementResult> {
    const [session, question, result] = await this.checkEndedOrTimedOut(userId);
    if (result !== undefined) return result;
    assert(question !== undefined);
    return this.questionService.createPlacementQuestion(question, session);
  }

  async submitAnswer(
    userId: string,
    dto: SubmitAnswerDto,
  ): Promise<PlacementQuestion | PlacementResult> {
    const [session, question, result] = await this.checkEndedOrTimedOut(userId);
    if (result !== undefined) return result;
    assert(question !== undefined);

    if (dto.questionId !== session.currentQuestionId) {
      return this.questionService.createPlacementQuestion(question, session);
    }

    await this.sessionService.archiveQuestionAnswer(userId, dto);
    session.totalAnswered += 1;
    await this.progressService.adjustSessionFromAnswer(dto.choice, question, session, userId);
    await this.sessionService.saveExamSession(userId, session);

    const resultUserAnswer = await this.progressService.getResult(userId, session);
    if (resultUserAnswer !== undefined) {
      return resultUserAnswer;
    }

    return this.questionService.getNewPlacementQuestion(userId, session);
  }

  async quitPlacement(userId: string): Promise<void> {
    await this.sessionService.deleteSession(userId);
  }
}
