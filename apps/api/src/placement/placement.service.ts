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
export const START_LEVEL = 'B1';

@Injectable()
export class PlacementService {
  constructor(
    private readonly sessionService: PlacementSessionService,
    private readonly questionService: PlacementQuestionService,
    private readonly progressService: PlacementProgressService,
  ) {}

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
    session.totalAnswered += 1;
    await this.progressService.adjustSessionFromAnswer(
      lastAnswer.choice,
      question,
      session,
      _userId,
    );
    await this.sessionService.saveExamSession(_userId, session);
    const result = await this.progressService.getResult(_userId, session);
    if (result !== undefined) {
      return result;
    }
    return this.questionService.getNewPlacementQuestion(_userId, session);
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

    const result = await this.progressService.getResult(_userId, session);
    if (result !== undefined) {
      return [session, undefined, result];
    }

    const question = await this.progressService.getQuestion(session.currentQuestionId);
    if (this.progressService.hasTimedOut(question, session.servedAt)) {
      const timedOutResult = await this.getTimeOut(_userId, question, session);
      return [session, question, timedOutResult];
    }
    return [session, question, undefined];
  }

  async startPlacement(_userId: string, _dto: StartPlacementDto): Promise<PlacementQuestion> {
    const existing = await this.sessionService.hasActiveSession(_userId);
    if (existing) {
      throw new ConflictException('placement.inProgress');
    }

    const examSession: ExamSession = {
      lang: _dto.lang,
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

    return this.questionService.getNewPlacementQuestion(_userId, examSession);
  }

  async getPlacement(_userId: string): Promise<PlacementQuestion | PlacementResult> {
    const [session, question, result] = await this.checkEndedOrTimedOut(_userId);
    if (result !== undefined) return result;
    assert(question !== undefined);
    return this.questionService.createPlacementQuestion(question, session);
  }

  async submitAnswer(
    _userId: string,
    _dto: SubmitAnswerDto,
  ): Promise<PlacementQuestion | PlacementResult> {
    const [session, question, result] = await this.checkEndedOrTimedOut(_userId);
    if (result !== undefined) return result;
    assert(question !== undefined);

    if (_dto.questionId !== session.currentQuestionId) {
      return this.questionService.createPlacementQuestion(question, session);
    }

    await this.sessionService.archiveQuestionAnswer(_userId, _dto);
    session.totalAnswered += 1;
    await this.progressService.adjustSessionFromAnswer(_dto.choice, question, session, _userId);
    await this.sessionService.saveExamSession(_userId, session);

    const result_user_answer = await this.progressService.getResult(_userId, session);
    if (result_user_answer !== undefined) {
      return result_user_answer;
    }

    return this.questionService.getNewPlacementQuestion(_userId, session);
  }

  async quitPlacement(_userId: string): Promise<void> {
    await this.sessionService.deleteSession(_userId);
  }
}
