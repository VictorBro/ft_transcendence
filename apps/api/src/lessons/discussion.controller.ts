import { Body, Controller, Logger, Param, Post, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { LEARNABLE_LANGUAGES } from '@ft/shared';
import type { ErrorCode, Language, SessionUser } from '@ft/shared';

import { CurrentUser } from '../auth/auth.decorators';
import { LlmError, type LlmFailure } from '../llm/llm.provider';
import { LangParam } from '../validation.pipe';
import { DiscussionService } from './discussion.service';
import { openEventStream } from './event-stream';
import { LessonDiscussionDto } from './lessons.dto';

/*
 * The lesson discussion route. Its own controller, not LessonsController,
 * because it answers differently: not one JSON reply, but a stream of events
 * on one HTTP response (Server-Sent Events), written by hand.
 *
 * @Res() hands us Express's response object. Nest then sends nothing itself:
 * what the browser gets is what this method writes. An exception thrown before
 * openEventStream still reaches Nest's error filter, which sends the usual JSON
 * error, since no byte has left yet.
 *
 * The events, in order:
 *   event: delta   data: {"text":"…"}    one per piece of the answer
 *   event: done    data: {}              the answer is complete
 *   event: error   data: {"code":"…"}    instead of done, after any pieces already sent:
 *                                         an llm.* code (ERROR_CODE below), or unknown
 * and a ": heartbeat" comment every 15 s (event-stream.ts).
 */

/**
 * The code an error event carries, by why the LLM failed. The reason is what
 * the logs and the metrics keep; the code is what the learner can act on, so
 * failures the learner meets the same way share one: a timeout, a dropped
 * connection and a 503 all say "try again in a moment". Anything that is not
 * an LlmError is a bug, and gets "unknown".
 */
const ERROR_CODE: Record<LlmFailure, ErrorCode> = {
  unreachable: 'llm.unavailable',
  http_error: 'llm.unavailable',
  // A reply that fails its schema: only structured calls have one, never a discussion.
  invalid: 'llm.unavailable',
  rate_limited: 'llm.rateLimited',
  blocked: 'llm.blocked',
  incomplete: 'llm.incomplete',
  disabled: 'llm.disabled',
};
@ApiTags('lessons')
@ApiParam({ name: 'lang', enum: [...LEARNABLE_LANGUAGES] })
@Controller('courses/:lang')
export class DiscussionController {
  private readonly logger = new Logger(DiscussionController.name);

  constructor(private readonly discussion: DiscussionService) {}

  /** POST /courses/:lang/lessons/:id/discussion { attemptId, message, history }. */
  @Post('lessons/:id/discussion')
  @ApiOperation({ summary: "Ask the lesson's tutor; the answer streams as Server-Sent Events" })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    description: 'delta { text } events, then done, or error { code }: an llm.* code, or unknown',
  })
  @ApiBadRequestResponse({ description: 'The body does not match LessonDiscussionSchema' })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  @ApiNotFoundResponse({ description: 'No course in that language, or no such ready lesson' })
  @ApiConflictResponse({
    description:
      'The course has no level yet (no placement), or the attempt is not on its discussion page',
  })
  async discuss(
    @CurrentUser() user: SessionUser,
    @Param('lang', LangParam) lang: Language,
    @Param('id') id: string,
    @Body() body: LessonDiscussionDto,
    @Res() response: Response,
  ): Promise<void> {
    // 1. Every check that can still answer with a status: 404, 409.
    const system = await this.discussion.open(user, lang, id, body.attemptId);

    // 2. The 200 leaves here. From now on, a failure is an event.
    const stream = openEventStream(response);
    try {
      for await (const text of this.discussion.answer(system, body, stream.signal)) {
        stream.send('delta', { text });
      }
      stream.send('done', {});
    } catch (error) {
      // The learner left: nobody is there to read an event.
      if (!stream.signal.aborted) {
        // An LlmError is an LLM failure, already counted in the metrics; anything else is a bug.
        if (error instanceof LlmError) this.logger.warn(`lesson-discussion: ${error.message}`);
        else this.logger.error(error);
        const code: ErrorCode = error instanceof LlmError ? ERROR_CODE[error.reason] : 'unknown';
        stream.send('error', { code });
      }
    } finally {
      stream.end();
    }
  }
}
