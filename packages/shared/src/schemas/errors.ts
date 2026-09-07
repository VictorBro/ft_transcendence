/**
 * Error codes, not sentences.
 *
 * Everything that crosses a boundary — a Zod message from this package, an
 * exception from NestJS, a failure in the browser's fetch layer — travels as
 * one of these codes. The only place a human sentence exists is
 * apps/web/messages/{en,fr,de}.json, which is what makes an error message
 * translatable at all: a string rendered by the server cannot be re-rendered in
 * the reader's language once it has crossed the wire.
 *
 * Adding a code without adding its three translations fails messages.test.ts,
 * which asserts this list and the `Errors` namespace hold exactly the same keys.
 */
export const ERROR_CODES = [
  'displayName.tooShort',
  'displayName.tooLong',
  'displayName.invalidCharacters',
  'password.tooShort',
  'password.tooLong',
  'password.needsLowercase',
  'password.needsUppercase',
  'password.needsDigit',
  'password.required',
  'password.mismatch',
  'email.invalid',
  'avatarUrl.invalid',
  'profile.noChanges',
  'twoFactor.codeFormat',
  'twoFactor.recoveryCodeFormat',
  /** Neither an authenticator code nor a recovery code, at the login step. */
  'twoFactor.secondFactorFormat',
  /** Raised by the API rather than by a schema: the browser cannot check any
   *  of these before asking. */
  'auth.invalidCredentials',
  'auth.incorrectPassword',
  'auth.identityTaken',
  'auth.displayNameTaken',
  'auth.passwordFirst',
  'twoFactor.setupFirst',
  'twoFactor.invalidCode',
  /** The browser never reached the API: offline, DNS, proxy down. */
  'network.unreachable',
  /** A status the client has no specific wording for. Carries `{status}`. */
  'server.unexpected',
  /** Last resort, so an unrecognised code degrades to a translated sentence
   *  instead of leaking English server text into a French page. */
  'unknown',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}
