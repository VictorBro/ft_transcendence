import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { SessionUser } from '@ft/shared';

import { CurrentUser } from '../auth/auth.decorators';
import { PlacementQuestionDto, StartPlacementDto, SubmitAnswerDto } from './placement.dto';
import { PlacementService } from './placement.service';

@ApiTags('placement')
@Controller('placement')
export class PlacementController {
  constructor(private readonly placement: PlacementService) {}

  @Post()
  @ApiOperation({ summary: 'Start a placement exam' })
  @ApiCreatedResponse({
    type: PlacementQuestionDto,
    description: 'First question of the placement exam',
  })
  @ApiConflictResponse({ description: 'A placement exam is already running' })
  startPlacement(@CurrentUser() user: SessionUser, @Body() body: StartPlacementDto) {
    return this.placement.startPlacement(user.id, body);
  }

  @Get()
  @ApiOperation({ summary: 'Get current placement question or result' })
  @ApiOkResponse({ description: 'Current question or placement result' })
  getPlacement(@CurrentUser() user: SessionUser) {
    return this.placement.getPlacement(user.id);
  }

  @Post('answers')
  @ApiOperation({ summary: 'Submit an answer to the current placement question' })
  @ApiCreatedResponse({ description: 'Next question or placement result' })
  submitAnswer(@CurrentUser() user: SessionUser, @Body() body: SubmitAnswerDto) {
    return this.placement.submitAnswer(user.id, body);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quit the current placement exam' })
  @ApiNoContentResponse({ description: 'Placement exam cancelled' })
  quitPlacement(@CurrentUser() user: SessionUser) {
    return this.placement.quitPlacement(user.id);
  }
}
