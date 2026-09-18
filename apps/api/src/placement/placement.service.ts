import { Injectable } from '@nestjs/common';

import { StartPlacementDto, SubmitAnswerDto } from './placement.dto';

@Injectable()
export class PlacementService {
  async startPlacement(_userId: string, _dto: StartPlacementDto) {}

  async getPlacement(_userId: string) {}

  async submitAnswer(_userId: string, _dto: SubmitAnswerDto) {}

  async quitPlacement(_userId: string) {}
}
