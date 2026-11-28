/** Browser half of the AI tutor routes, like friends-client.ts. */
import { TutorCheckSchema, TutorInfoSchema, type TutorCheck, type TutorInfo } from '@ft/shared';

import { clientGet, clientPost, type ApiResult } from '@/lib/api-client';

/** What runs the tutor: no call to Google. */
export function loadTutorInfo(): Promise<ApiResult<TutorInfo>> {
  return clientGet(TutorInfoSchema, '/api/tutor');
}

/** Tests the server's key. Throttled: 3 a minute per account. */
export function checkTutor(): Promise<ApiResult<TutorCheck>> {
  return clientPost(TutorCheckSchema, '/api/tutor/check');
}
