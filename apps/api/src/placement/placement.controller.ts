import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import type { PlacementQuestion, PlacementResult, SessionUser } from '@ft/shared';

import { CurrentUser } from '../auth/auth.decorators';
import {
  PlacementQuestionDto,
  PlacementResultDto,
  StartPlacementDto,
  SubmitAnswerDto,
} from './placement.dto';
import { PlacementService } from './placement.service';

/** GET and the answer route return one or the other, depending on whether the run is over. */
const QUESTION_OR_RESULT = {
  oneOf: [
    { $ref: getSchemaPath(PlacementQuestionDto) },
    { $ref: getSchemaPath(PlacementResultDto) },
  ],
};

/** A singleton resource, like /api/auth/me: the run belongs to the caller, so no id in the URL. */
@ApiTags('placement')
@ApiExtraModels(PlacementQuestionDto, PlacementResultDto)
@ApiUnauthorizedResponse({ description: 'No valid session' })
@Controller('placement')
export class PlacementController {
  constructor(private readonly placement: PlacementService) {}

  @Post()
  @ApiOperation({ summary: 'Start a placement exam, or a retake once one is finished' })
  @ApiCreatedResponse({ type: PlacementQuestionDto, description: 'The first question' })
  @ApiNotFoundResponse({
    description:
      'No course in that language (`course.notFound`), or no unseen question (`placement.poolExhausted`)',
  })
  @ApiConflictResponse({ description: 'A run is already going (`placement.inProgress`)' })
  start(
    @CurrentUser() user: SessionUser,
    @Body() body: StartPlacementDto,
  ): Promise<PlacementQuestion> {
    return this.placement.start(user.id, body.lang);
  }

  @Get()
  @ApiOperation({ summary: 'The question on screen, or the result once the run is over' })
  @ApiOkResponse({ schema: QUESTION_OR_RESULT })
  @ApiNotFoundResponse({ description: 'No run (`placement.notFound`)' })
  @ApiConflictResponse({ description: 'Its question left the bank (`placement.expired`)' })
  current(@CurrentUser() user: SessionUser): Promise<PlacementQuestion | PlacementResult> {
    return this.placement.current(user.id);
  }

  @Post('answers')
  @ApiOperation({ summary: 'Answer the question on screen' })
  @ApiCreatedResponse({
    schema: QUESTION_OR_RESULT,
    description: 'The next question, or the result',
  })
  @ApiBadRequestResponse({ description: 'Not one of the options (`placement.invalidChoice`)' })
  @ApiNotFoundResponse({
    description:
      'No run (`placement.notFound`), or no unseen question left (`placement.poolExhausted`)',
  })
  @ApiConflictResponse({
    description:
      'Not the question on screen, its question left the bank, or another request is running',
  })
  answer(
    @CurrentUser() user: SessionUser,
    @Body() body: SubmitAnswerDto,
  ): Promise<PlacementQuestion | PlacementResult> {
    return this.placement.answer(user.id, body);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quit the run. The course level is left as it was' })
  @ApiNoContentResponse({ description: 'Gone, or there was nothing to quit' })
  @ApiConflictResponse({ description: 'Another request is running (`placement.inProgress`)' })
  quit(@CurrentUser() user: SessionUser): Promise<void> {
    return this.placement.quit(user.id);
  }
}
