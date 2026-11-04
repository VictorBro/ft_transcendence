import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { LEARNABLE_LANGUAGES } from '@ft/shared';
import type { Language, SessionUser } from '@ft/shared';

import { AttemptsService } from './attempts.service';
import { AttemptReadDto } from './lessons.dto';
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
}
