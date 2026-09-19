import { Module } from '@nestjs/common';

import { PlacementController } from './placement.controller';
import { PlacementService } from './placement.service';
import { PlacementSessionService } from './placement-session.service';

@Module({
  controllers: [PlacementController],
  providers: [PlacementService, PlacementSessionService],
  exports: [PlacementService, PlacementSessionService],
})
export class PlacementModule {}
