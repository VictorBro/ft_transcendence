// import { PlacementQuestionSchema, PlacementResult, PlacementResultSchema } from '@ft/shared';
// import { z } from 'zod';
import {
  type FetchSessionOptions,
  buildApiUrl,
  describeFetchError,
  DEFAULT_TIMEOUT_MS,
} from './api';

import { headers, cookies } from 'next/headers';
import { PlacementStateSchema, type PlacementState } from './placement-schema';

export type PlacementLoadResult =
  | { status: 'ok'; data: PlacementState }
  | { status: 'no-run' }
  | { status: 'signed-out' }
  | { status: 'unavailable'; reason: string };

export async function fetchPlacement(options: FetchSessionOptions): Promise<PlacementLoadResult> {
  const {
    baseUrl,
    cookie,
    forwardedFor,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
  } = options;

  try {
    const response = await fetchImpl(buildApiUrl(baseUrl, 'api/placement'), {
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        ...(cookie ? { cookie } : {}),
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status === 401) {
      return { status: 'signed-out' };
    }
    if (response.status === 404) {
      return { status: 'no-run' };
    }
    if (!response.ok) {
      return { status: 'unavailable', reason: `the API answered HTTP ${response.status}` };
    }

    const parsed = await PlacementStateSchema.safeParseAsync(await response.json());
    if (!parsed.success) {
      return { status: 'unavailable', reason: 'the API an unexpected payload' };
    }

    return { status: 'ok', data: parsed.data };
  } catch (error) {
    return { status: 'unavailable', reason: describeFetchError(error) };
  }
}

export async function loadPlacement(): Promise<PlacementLoadResult> {
  const store = await cookies();
  const cookie = store
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');
  const forwardedFor = (await headers()).get('x-forwarded-for');

  return fetchPlacement({
    baseUrl: process.env.API_INTERNAL_URL,
    cookie,
    forwardedFor: forwardedFor ?? undefined,
  });
}
