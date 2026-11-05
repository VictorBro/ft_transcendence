import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { lessons } from '@ft/shared';
import type { Language, LessonDiscussionInput, SessionUser } from '@ft/shared';

import { LLM_PROVIDER, type LlmProvider } from '../llm/llm.provider';
import { PrismaService } from '../prisma/prisma.service';
import { findAttempt } from './attempts.service';
import { checkCourse } from './course-lookup';
import { discussionPrompt, practiceMistakes } from './discussion-prompt';

/** The longest tutor answer we pay for, in tokens. */
const MAX_OUTPUT_TOKENS = 1000;

/**
 * The lesson discussion (#150): the learner asks the tutor about a lesson,
 * the tutor answers piece by piece.
 *
 * It works in two steps, because of how a stream answers over HTTP:
 * - open() checks everything that can still end in an error status (404, 409),
 *   before the route sends its 200;
 * - answer() starts the LLM call. From then on a failure can only be an event
 *   of the stream (see discussion.controller.ts).
 *
 * Stateless: nothing of the discussion is stored. The browser sends the earlier
 * turns back with each message.
 */
@Injectable()
export class DiscussionService {
  constructor(
    private readonly prisma: PrismaService,
    // The LLM by its token: LlmProvider is an interface, erased once compiled.
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  /**
   * Checks that the learner may talk about this lesson, and builds the tutor's
   * system prompt from it. Throws, before anything is sent:
   * - 404 course.notFound: no course in that language;
   * - 409 course.notPlaced: the course has no level yet;
   * - 404 lesson.notFound: no such lesson in it, or it is not ready;
   * - 409 attempt.stale: no running attempt `attemptId` at this lesson, or its
   *   cursor is not on the discussion page. The discussion page comes before
   *   the exam, so once the exam starts the tutor is gone.
   * The prompt holds the attempt's wrong practice answers, for "Explain my mistakes".
   */
  async open(user: SessionUser, lang: Language, id: string, attemptId: string): Promise<string> {
    // The course first: without one, the answer is course.notFound, not lesson.notFound.
    const course = checkCourse(
      await this.prisma.userLevel.findUnique({
        where: { userId_lang: { userId: user.id, lang } },
        select: { id: true, level: true },
      }),
      { placed: true },
    );
    const { lesson, source, row, plan } = await findAttempt(
      this.prisma,
      course.id,
      lang,
      id,
      attemptId,
    );
    if (plan.pages[row.page].role !== 'discussion') {
      throw new ConflictException('attempt.stale');
    }
    // The seed only marks a lesson ready once its brief passes these schemas, so a
    // failure here is a bug, and the 500 it gives is right.
    if (!lessons.isSupportedKind(lesson.kind)) throw new Error(`No schema for ${lesson.kind}`);
    const parsed = lessons.briefSchema(lesson.kind, lang).parse(source.brief);
    const answers = row.answers as unknown as Record<string, lessons.player.LockedAnswer>;
    return discussionPrompt(parsed, user.locale, practiceMistakes(plan, answers));
  }

  /**
   * The tutor's answer to the learner's message, piece by piece. The earlier
   * turns come first, then the new message, as the LLM expects them.
   * signal cancels the call when the learner leaves.
   */
  answer(system: string, body: LessonDiscussionInput, signal: AbortSignal): AsyncIterable<string> {
    return this.llm.streamText({
      purpose: 'lesson-discussion',
      system,
      messages: [...body.history, { role: 'user', text: body.message }],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      signal,
    });
  }
}
