import { Controller, Get, Param, Query } from '@nestjs/common';
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

import { LessonsService } from './lessons.service';
import { LessonCardDto, LessonPageDto, LessonQueryDto, TodayDto } from './lessons.dto';
import { CurrentUser } from '../auth/auth.decorators';
import { LangParam } from '../validation.pipe';

/*
 * The controller is the waiter: it takes the order (the HTTP request), passes
 * it to the kitchen (LessonsService), and brings back what the service gives.
 * It does no work itself, so each route is one line.
 *
 * The @… are labels for Nest:
 *   @Get('…')            → which URL the method answers
 *   @Api…                → only for Swagger (/api/docs): what the route does
 *                          and what it can answer
 *   @CurrentUser()       → the logged in user, with its id and timeZone
 *   @Param('lang', …)    → the :lang of the URL, checked by LangParam
 *   @Query()             → what comes after the ? in the URL
 *
 * `new Date()` is made here, once per request, and not in the service: the
 * service gets the time as a parameter, so a test can give it any date.
 *
 * @ApiParam once, on the class: it counts for every route. `Language` is a
 * type only, so Swagger cannot see it and would drop the lang parameter
 * without it.
 */
@ApiTags('lessons')
@ApiParam({ name: 'lang', enum: [...LEARNABLE_LANGUAGES] })
// Every route of this class starts with /courses/:lang, where :lang is a hole
// in the URL: /courses/fr/today gives lang = 'fr'.
@Controller('courses/:lang')
export class LessonsController {
  // Nest gives the service here by itself (dependency injection).
  constructor(private readonly lessons: LessonsService) {}

  /** GET /courses/:lang/today: 404 without a course, 409 before placement. */
  @Get('today')
  @ApiOperation({ summary: "Today's lessons, streak and progress" })
  @ApiOkResponse({ type: TodayDto })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  @ApiNotFoundResponse({ description: 'No course in that language' })
  @ApiConflictResponse({ description: 'The course has no level yet (no placement)' })
  today(@CurrentUser() user: SessionUser, @Param('lang', LangParam) lang: Language) {
    return this.lessons.today(user.id, lang, user.timeZone, new Date());
  }

  /**
   * GET /courses/:lang/lessons?q=…&sort=…&page=…: 404 without a course, 409 before placement.
   * LessonQueryDto checks the params first, so sort=foo or page=0 never give a 400.
   * Not called `lessons`: that name is already the service, in the constructor.
   */
  @Get('lessons')
  @ApiOperation({ summary: "Search the level's lessons: filters, text, sort, groups and pages" })
  @ApiOkResponse({ type: LessonPageDto })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  @ApiNotFoundResponse({ description: 'No course in that language' })
  @ApiConflictResponse({ description: 'The course has no level yet (no placement)' })
  listLessons(
    @CurrentUser() user: SessionUser,
    @Param('lang', LangParam) lang: Language,
    @Query() query: LessonQueryDto,
  ) {
    return this.lessons.lessons(user.id, lang, user.timeZone, new Date(), query);
  }

  /**
   * GET /courses/:lang/lessons/:id: no 409 here, a course without a level can
   * still open a lesson. 404 when there is no course, or no such lesson in it.
   */
  @Get('lessons/:id')
  @ApiOperation({ summary: 'One lesson card, also before placement' })
  @ApiOkResponse({ type: LessonCardDto })
  @ApiUnauthorizedResponse({ description: 'No valid session' })
  @ApiNotFoundResponse({ description: 'No course in that language, or no such lesson in it' })
  getLesson(
    @CurrentUser() user: SessionUser,
    @Param('lang', LangParam) lang: Language,
    @Param('id') id: string,
  ) {
    return this.lessons.lesson(user.id, lang, id);
  }
}
