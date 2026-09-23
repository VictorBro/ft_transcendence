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

@ApiTags('placement')
@ApiExtraModels(PlacementQuestionDto, PlacementResultDto)
@Controller('placement')
export class PlacementController {
  constructor(private readonly placement: PlacementService) {}

  /**
   * Starts a new placement exam for the authenticated user in the requested language.
   *
   * @param user - Authenticated session user initiating the exam.
   * @param body - Parameters specifying the target language.
   * @returns The first question of the placement exam.
   * @throws ConflictException If an active exam is already in progress or onboarding is incomplete.
   */
  @Post()
  @ApiOperation({ summary: 'Start a placement exam' })
  @ApiCreatedResponse({
    type: PlacementQuestionDto,
    description: 'First question of the placement exam',
  })
  @ApiConflictResponse({
    description: 'A placement exam is already running or onboarding is incomplete',
  })
  startPlacement(
    @CurrentUser() user: SessionUser,
    @Body() body: StartPlacementDto,
  ): Promise<PlacementQuestion> {
    return this.placement.startPlacement(user.id, body);
  }

  /**
   * Retrieves the current placement question or the final placement result if ended.
   * Strictly read-only to preserve HTTP GET idempotency and avoid side effects.
   *
   * @param user - Authenticated session user.
   * @returns Current placement question or the completed exam result.
   * @throws NotFoundException If no active placement exam exists.
   */
  @Get()
  @ApiOperation({ summary: 'Get current placement question or result' })
  @ApiOkResponse({
    description: 'Current question or placement result',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(PlacementQuestionDto) },
        { $ref: getSchemaPath(PlacementResultDto) },
      ],
    },
  })
  @ApiConflictResponse({
    description: 'Stored placement session is invalid (`placement.invalidSession`)',
  })
  @ApiNotFoundResponse({ description: 'No active placement exam' })
  getPlacement(@CurrentUser() user: SessionUser): Promise<PlacementQuestion | PlacementResult> {
    return this.placement.getPlacement(user.id);
  }

  /**
   * Submits an answer to the currently active placement question.
   * Evaluates timeouts, updates difficulty adaptively, and advances the session.
   *
   * @param user - Authenticated session user submitting the answer.
   * @param body - Submitted answer payload with question ID and chosen option.
   * @returns The next placement question or the final placement result.
   * @throws NotFoundException If no active placement exam exists.
   */
  @Post('answers')
  @ApiOperation({ summary: 'Submit an answer to the current placement question' })
  @ApiCreatedResponse({
    description: 'Next question or placement result',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(PlacementQuestionDto) },
        { $ref: getSchemaPath(PlacementResultDto) },
      ],
    },
  })
  @ApiBadRequestResponse({
    description: 'Choice is not one of the question options (`placement.invalidChoice`)',
  })
  @ApiConflictResponse({
    description:
      'Placement is busy, stored session is invalid, or question ID does not match the active question',
  })
  @ApiNotFoundResponse({ description: 'No active placement exam' })
  submitAnswer(
    @CurrentUser() user: SessionUser,
    @Body() body: SubmitAnswerDto,
  ): Promise<PlacementQuestion | PlacementResult> {
    return this.placement.submitAnswer(user.id, body);
  }

  /**
   * Quits and abandons the current placement exam, purging active session data.
   *
   * @param user - Authenticated session user quitting the exam.
   * @returns Promise resolving when the placement exam is cancelled.
   * @throws ConflictException If another placement mutation holds the lock.
   */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quit the current placement exam' })
  @ApiNoContentResponse({ description: 'Placement exam cancelled' })
  @ApiConflictResponse({ description: 'Placement is busy (`placement.inProgress`)' })
  quitPlacement(@CurrentUser() user: SessionUser): Promise<void> {
    return this.placement.quitPlacement(user.id);
  }

  /**
   * Aborts the current placement exam, archiving the current question with a null answer
   * and returning the final placement result with `targetLevel: null`.
   *
   * @param user - Authenticated session user aborting the exam.
   * @returns Placement result with `targetLevel: null` indicating an aborted exam.
   * @throws NotFoundException If no active placement exam exists.
   */
  @Post('abort')
  @ApiOperation({ summary: 'Abort the current placement exam' })
  @ApiOkResponse({
    type: PlacementResultDto,
    description: 'Placement result with targetLevel: null indicating abortion',
  })
  @ApiConflictResponse({
    description: 'Placement is busy (`placement.inProgress`)',
  })
  @ApiNotFoundResponse({ description: 'No active placement exam' })
  abortExam(@CurrentUser() user: SessionUser): Promise<PlacementResult> {
    return this.placement.abortExam(user.id);
  }
}
