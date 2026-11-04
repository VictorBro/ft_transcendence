import { Body, Controller, Get, HttpStatus, Param, Post, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { LEARNABLE_LANGUAGES } from '@ft/shared';
import type { Language, SessionUser } from '@ft/shared';

import { AttemptsService } from './attempts.service';
import { AttemptReadDto, AttemptViewDto, StartAttemptDto } from './lessons.dto';
import { CurrentUser } from '../auth/auth.decorators';
import { LangParam } from '../validation.pipe';

/*
 * The lesson attempt (#145): the server sends only the page at the cursor,
 * checks every answer and records the result. No route takes a score.
 * `new Date()` is made here, once per request, as in LessonsController.
 */
@ApiTags('lessons')
@ApiParam({ name: 'lang', enum: [...LEARNABLE_LANGUAGES] })
@Controller('courses/:lang/lessons/:id/attempt')
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  /** GET …/attempt: read only, attempt is null before the first start. */
  @Get()
  @ApiOperation({ summary: "The lesson's outline and the learner's attempt" })
  @ApiOkResponse({ type: AttemptReadDto })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  @ApiNotFoundResponse({
    description: 'No course in that language, or no such lesson in it, or it is not ready',
  })
  @ApiConflictResponse({ description: 'The course has no level yet (no placement)' })
  read(
    @CurrentUser() user: SessionUser,
    @Param('lang', LangParam) lang: Language,
    @Param('id') id: string,
  ) {
    return this.attempts.read(user.id, lang, id, new Date());
  }

  /**
   * POST …/attempt { locale }: 201 a new attempt, or 200 the one in progress.
   * After the results, a retake: the old attempt goes, a new one comes (201).
   */
  @Post()
  @ApiOperation({ summary: 'Start a lesson, resume it, or retake it after the results' })
  @ApiCreatedResponse({ type: AttemptViewDto, description: 'A new attempt' })
  @ApiOkResponse({ type: AttemptViewDto, description: 'The attempt in progress' })
  @ApiBadRequestResponse({ description: 'Not one of the supported locales' })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  @ApiNotFoundResponse({
    description: 'No course in that language, or no such lesson in it, or it is not ready',
  })
  @ApiConflictResponse({ description: 'The course has no level yet (no placement)' })
  async start(
    @CurrentUser() user: SessionUser,
    @Param('lang', LangParam) lang: Language,
    @Param('id') id: string,
    @Body() body: StartAttemptDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { created, attempt } = await this.attempts.start(
      user.id,
      lang,
      id,
      body.locale,
      new Date(),
    );
    // A POST answers 201 by default; resuming creates nothing.
    if (!created) {
      response.status(HttpStatus.OK);
    }
    return attempt;
  }
}
