import { Injectable } from '@nestjs/common';
import { ExamSession, ExamSessionSchema, SubmitAnswerInput } from '@ft/shared';

import { RedisService } from '../redis/redis.service';

export const PLACEMENT_REDIS_KEY_TTL = 3600;

@Injectable()
export class PlacementSessionService {
  constructor(private readonly redis: RedisService) {}

  evalKey(userId: string): string {
    return `user:${userId}:eval`;
  }

  evalQuestionsKey(userId: string): string {
    return `user:${userId}:eval_questions`;
  }

  async hasActiveSession(userId: string): Promise<boolean> {
    const existing = await this.redis.client.exists(this.evalKey(userId));
    return Boolean(existing);
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
      totalAnswered: session.totalAnswered.toString(),
      ended: session.ended.toString(),
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
      totalAnswered: Number(data.totalAnswered ?? 0),
      ended: data.ended === 'true',
      currentQuestionId: data.currentQuestionId ? data.currentQuestionId : null,
      servedAt: data.servedAt,
    });
  }

  async archiveQuestionAnswer(userId: string, answer: SubmitAnswerInput): Promise<void> {
    const questionsSetKey = this.evalQuestionsKey(userId);
    await this.redis.client.sAdd(questionsSetKey, JSON.stringify(answer));
    await this.redis.client.expire(questionsSetKey, PLACEMENT_REDIS_KEY_TTL);
    await this.redis.client.hIncrBy(this.evalKey(userId), 'totalAnswered', 1);
  }

  async deleteSession(userId: string): Promise<void> {
    await this.redis.client.del([this.evalKey(userId), this.evalQuestionsKey(userId)]);
  }
}
