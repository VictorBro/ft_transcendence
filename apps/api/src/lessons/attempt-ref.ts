import { createHmac, randomBytes } from 'node:crypto';
import type { lessons } from '@ft/shared';

type RefOf = lessons.player.RefOf;

/** A new attempt's secret: 32 random bytes, stored in LessonAttempt.secret and never sent. */
export const newSecret = () => randomBytes(32);

/**
 * The ref the browser sees for an internal path: HMAC-SHA256 with the
 * attempt's secret, in base64url, cut to 16 characters (RefSchema).
 * The same secret and path always give the same ref, so nothing is stored:
 * every request rebuilds them. Another attempt's secret gives other refs.
 */
export const refOf =
  (secret: Uint8Array): RefOf =>
  (path) =>
    createHmac('sha256', secret).update(path).digest('base64url').slice(0, 16);
