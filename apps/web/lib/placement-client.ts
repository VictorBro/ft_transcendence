import { z } from 'zod';

import { type Language } from '@ft/shared';
import { type PlacementState, PlacementStateSchema } from './placement-schema';
import { clientPost, clientDelete, type ApiResult } from './api-client';

export function startPlacement(lang: Language): Promise<ApiResult<PlacementState>> {
  return clientPost(PlacementStateSchema, '/api/placement', { lang });
}

export function submitPlacementAnswer(
  questionId: string,
  choice: string | null,
): Promise<ApiResult<PlacementState>> {
  return clientPost(PlacementStateSchema, '/api/placement/answers', { questionId, choice });
}

export function quitPlacement(): Promise<ApiResult<void>> {
  return clientDelete(z.void(), '/api/placement');
}
