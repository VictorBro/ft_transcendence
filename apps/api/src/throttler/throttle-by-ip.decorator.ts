import { SetMetadata, applyDecorators } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

/**
 * Our own metadata key, rather than reading @nestjs/throttler's. That one is
 * built from the configured throttler's name (`THROTTLER:LIMITdefault`), is not
 * exported, and is absent when a @Throttle sets only a ttl. Three ways for a
 * route to silently lose its per-address budget.
 */
export const THROTTLE_BY_IP = 'throttle:by-ip';

/**
 * Rate-limits a route per client address instead of per account, and sets the
 * budget in one place.
 *
 * Belongs on anything that verifies a secret. Those routes have to count every
 * attempt from one machine against one budget: metering them per account hands
 * the attacker the key to his own bucket, because each of the N accounts he
 * controls opens a fresh budget and a limit that reads 5 behaves like 5N.
 */
export function ThrottleByIp(limit: number, ttl = 60_000) {
  return applyDecorators(Throttle({ default: { limit, ttl } }), SetMetadata(THROTTLE_BY_IP, true));
}
