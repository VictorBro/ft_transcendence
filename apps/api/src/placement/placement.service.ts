import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExamSession, LEVELS, PlacementQuestion, PlacementResult } from '@ft/shared';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';

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

  /**
   * Processes a recorded or timed-out answer for the active session.
   * Adds the answer to the session, increments total answers, adjusts adaptive level progress,
   * and either saves and returns the final result if completed or fetches the next question.
   *
   * @param userId - Unique identifier of the user.
   * @param choice - Selected answer option, or `null` if timed out or skipped.
   * @param question - Question bank entity that was answered.
   * @param session - Current exam session state.
   * @returns Next placement question or completed placement result.
   */
  private async processAnswer(
    userId: string,
    choice: string | null,
    question: QuestionBank,
    session: ExamSession,
  ): Promise<PlacementQuestion | PlacementResult> {
    if (session.answers.some((answer) => answer.questionId === question.id)) {
      throw new ConflictException('placement.invalidSession');
    }
    session.answers.push({
      questionId: question.id,
      choice,
    });
    session.totalAnswered += 1;
    await this.progressService.adjustSessionFromAnswer(choice, question, session, userId);

    const result = await this.progressService.getResult(session);
    if (result !== undefined) {
      await this.sessionService.saveExamSession(userId, session);
      return result;
    }

    const newQuestion = await this.questionService.getNewPlacementQuestion(userId, session);
    await this.sessionService.saveExamSession(userId, session);
    return newQuestion;
  }

  /**
   * Validates whether the current placement exam has already completed or if the current
   * question has timed out. If timed out, automatically processes a null answer.
   *
   * @param userId - Unique identifier of the user.
   * @returns Tuple of `[session, question, result]` where `result` is defined if ended or timed out.
   * @throws NotFoundException If no active session or current question ID exists (`placement.notFound`).
   */
  async checkEndedOrTimedOut(
    userId: string,
  ): Promise<
    [ExamSession, QuestionBank | undefined, PlacementQuestion | PlacementResult | undefined]
  > {
    const session = await this.sessionService.loadExamSession(userId);
    if (!session || !session.currentQuestionId) {
      throw new NotFoundException('placement.notFound');
    }

    const result = await this.progressService.getResult(session);
    if (result !== undefined) {
      return [session, undefined, result];
    }

    const question = await this.progressService.getQuestion(session.currentQuestionId);
    if (this.progressService.hasTimedOut(question, session.servedAt)) {
      const timedOutResult = await this.processAnswer(userId, null, question, session);
      return [session, question, timedOutResult];
    }
    return [session, question, undefined];
  }

  /**
   * Initializes and starts a new placement exam session for the user.
   * Verifies that no active placement session exists and that onboarding is completed.
   *
   * @param userId - Unique identifier of the user starting the exam.
   * @param dto - Placement initiation payload containing the target language.
   * @returns The first question of the placement exam.
   * @throws ConflictException If a placement session is already in progress (`placement.inProgress`)
   *   or onboarding has not been completed (`placement.onboardingIncomplete`).
   */
  async startPlacement(userId: string, dto: StartPlacementDto): Promise<PlacementQuestion> {
    const lockToken = await this.sessionService.acquireLock(userId);
    if (!lockToken) {
      throw new ConflictException('placement.inProgress');
    }

    try {
      const existing = await this.sessionService.hasActiveSession(userId);
      if (existing) {
        throw new ConflictException('placement.inProgress');
      }

      if (!(await this.progressService.checkOnboardingCompleted(userId, dto.lang))) {
        throw new ConflictException('placement.onboardingIncomplete');
      }

      await this.sessionService.deleteSession(userId);

      const examSession: ExamSession = {
        evalId: randomUUID(),
        lang: dto.lang,
        lo: 0,
        hi: 5,
        level: LEVELS.indexOf(START_LEVEL),
        mistakesPerLevel: 0,
        askedPerCategory: { grammar: 0, vocabulary: 0, reading: 0 },
        totalAnswered: 0,
        answers: [],
        ended: false,
        currentQuestionId: null,
        servedAt: new Date().toISOString(),
      };

      const newQuestion = await this.questionService.getNewPlacementQuestion(userId, examSession);
      await this.sessionService.saveExamSession(userId, examSession);
      return newQuestion;
    } finally {
      await this.sessionService.releaseLock(userId, lockToken);
    }
  }

  /**
   * Retrieves the current placement question or the final placement result for the user.
   * Kept strictly read-only to preserve HTTP GET idempotency without side effects.
   *
   * @param userId - Unique identifier of the user.
   * @returns Current placement question or the completed exam result.
   * @throws NotFoundException If no active session or current question ID exists (`placement.notFound`).
   */
  async getPlacement(userId: string): Promise<PlacementQuestion | PlacementResult> {
    const session = await this.sessionService.loadExamSession(userId);
    if (!session) {
      throw new NotFoundException('placement.notFound');
    }
    const result = await this.progressService.getResult(session);
    if (result !== undefined) {
      return result;
    }
    if (!session.currentQuestionId) {
      throw new NotFoundException('placement.notFound');
    }
    const question = await this.progressService.getQuestion(session.currentQuestionId);
    return this.questionService.createPlacementQuestion(question, session);
  }

  /**
   * Submits an answer for the user's active question.
   * Evaluates timeouts, ensures question ID matching, and processes answer advancement.
   *
   * @param userId - Unique identifier of the user.
   * @param dto - Answer payload containing the question ID and choice.
   * @throws BadRequestException If choice is not null and not one of question.options (`placement.invalidChoice`).
   * @throws ConflictException If the placement lock cannot be acquired (`placement.inProgress`)
   *   or the submitted question does not match the active question (`placement.questionMismatch`).
   * @throws NotFoundException If no active placement session exists.
   */
  async submitAnswer(
    userId: string,
    dto: SubmitAnswerDto,
  ): Promise<PlacementQuestion | PlacementResult> {
    const lockToken = await this.sessionService.acquireLockWithRetry(userId);
    if (!lockToken) {
      throw new ConflictException('placement.inProgress');
    }

    try {
      const [session, question, result] = await this.checkEndedOrTimedOut(userId);
      if (result !== undefined) return result;
      assert(question !== undefined);

      if (dto.questionId !== session.currentQuestionId) {
        throw new ConflictException('placement.questionMismatch');
      }

      if (dto.choice !== null && !question.options.includes(dto.choice)) {
        throw new BadRequestException('placement.invalidChoice');
      }

      return await this.processAnswer(userId, dto.choice, question, session);
    } finally {
      await this.sessionService.releaseLock(userId, lockToken);
    }
  }

  /**
   * Quits and discards the active placement exam, removing session records from Redis.
   *
   * @param userId - Unique identifier of the user quitting the exam.
   * @returns Promise resolving when the session records are deleted.
   */
  async quitPlacement(userId: string): Promise<void> {
    const lockToken = await this.sessionService.acquireLockWithRetry(userId);
    if (!lockToken) {
      throw new ConflictException('placement.inProgress');
    }

    try {
      await this.sessionService.deleteSession(userId);
    } finally {
      await this.sessionService.releaseLock(userId, lockToken);
    }
  }
}
