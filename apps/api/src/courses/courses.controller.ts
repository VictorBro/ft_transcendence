import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { LanguageSchema } from '@ft/shared';
import type { Language, SessionUser } from '@ft/shared';

import { CoursesService } from './courses.service';
import { CurrentUser } from '../auth/auth.decorators';
import { StartCourseDto, SetGoalDto, SetLevelDto, CourseDto, CoursesDto } from './courses.dto';

// We get the language from the URL, so we must check that it matches our language definition
const LangParam = new ZodValidationPipe(LanguageSchema);

@ApiTags('courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  @ApiOperation({ summary: 'List courses for the current user' })
  @ApiOkResponse({ type: CoursesDto })
  listCourses(@CurrentUser() user: SessionUser) {
    return this.courses.listCoursesUser(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Start a course in a new language' })
  @ApiOkResponse({ type: CourseDto })
  @ApiConflictResponse({ description: 'Language already studied' })
  createNewCourse(@CurrentUser() user: SessionUser, @Body() body: StartCourseDto) {
    return this.courses.createCourse(user.id, body);
  }

  @Patch(':lang')
  @ApiOperation({ summary: 'Change the daily goal, without touching level' })
  @ApiOkResponse({ type: CourseDto })
  @ApiNotFoundResponse({ description: 'No course in that language' })
  setGoal(
    @CurrentUser() user: SessionUser,
    @Body() body: SetGoalDto,
    @Param('lang', LangParam) lang: Language,
  ) {
    return this.courses.setGoal(user.id, lang, body);
  }

  @Patch(':lang/level')
  @ApiOperation({
    summary: 'Set the level when: onboarding skipped, evaluation result or learner override',
  })
  @ApiOkResponse({ type: CourseDto })
  @ApiNotFoundResponse({ description: 'No course in that language' })
  setLevel(
    @CurrentUser() user: SessionUser,
    @Body() body: SetLevelDto,
    @Param('lang', LangParam) lang: Language,
  ) {
    return this.courses.setLevel(user.id, lang, body);
  }
}
