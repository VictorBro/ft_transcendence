/**
 * The rate limits an operator can tune through .env, each with its default.
 *
 * Read once, at import: the throttler decorators take numbers when their class
 * is defined, before Nest's ConfigService exists. An unset or empty variable
 * keeps the default, and anything but a positive integer stops the API at boot
 * rather than running with a limit nobody chose.
 */
export function readLimit(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer, not "${raw}"`);
  }
  return value;
}

export const RATE_LIMITS = {
  /** Requests a minute on every route, per account, or per address when signed out. */
  perAccount: readLimit(process.env, 'RATE_LIMIT_PER_MINUTE', 100),
  /** Signups a minute per address: each one writes a row and runs argon2. */
  signup: readLimit(process.env, 'SIGNUP_LIMIT_PER_MINUTE', 20),
  /** Password or 2FA code checks a minute per address, on each route that makes one. */
  login: readLimit(process.env, 'LOGIN_LIMIT_PER_MINUTE', 5),
} as const;
