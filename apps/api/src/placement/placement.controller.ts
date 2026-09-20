import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
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
  @ApiNotFoundResponse({ description: 'No active placement exam' })
  getPlacement(@CurrentUser() user: SessionUser): Promise<PlacementQuestion | PlacementResult> {
    return this.placement.getPlacement(user.id);
  }

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
  @ApiNotFoundResponse({ description: 'No active placement exam' })
  submitAnswer(
    @CurrentUser() user: SessionUser,
    @Body() body: SubmitAnswerDto,
  ): Promise<PlacementQuestion | PlacementResult> {
    return this.placement.submitAnswer(user.id, body);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quit the current placement exam' })
  @ApiNoContentResponse({ description: 'Placement exam cancelled' })
  quitPlacement(@CurrentUser() user: SessionUser): Promise<void> {
    return this.placement.quitPlacement(user.id);
  }
}
