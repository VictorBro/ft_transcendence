import { PlacementQuestionSchema, PlacementResult, PlacementResultSchema } from '@ft/shared';
import { z } from 'zod';

export const PlacementStateSchema = z.union([PlacementQuestionSchema, PlacementResultSchema]);

export type PlacementState = z.infer<typeof PlacementStateSchema>;

//We will know what type is returned saying state is PlacementResult, if report is not found it is not PlacementResult but PlacementQuestion
export function isPlacementResult(state: PlacementState): state is PlacementResult {
  return 'report' in state;
}
