'use client';

import { useTranslations } from 'next-intl';
import { isErrorCode } from '@ft/shared';

/**
 * The one place an error code becomes a sentence.
 *
 * Zod issues, API responses and the fetch layer all hand back an ERROR_CODES
 * entry (see @ft/shared), so nothing upstream has to know which language the
 * reader uses. Anything unrecognised — a 500 rendered by the proxy, a code
 * added on the API side before its translation lands — falls back to one
 * generic sentence rather than showing English text inside a French page.
 *
 * `status` is passed on every call because `server.unexpected` interpolates it;
 * messages that ignore it are unaffected.
 */
export function useErrorMessage(): (code: string, status?: number) => string {
  const t = useTranslations('Errors');

  return (code, status = 0) => t(isErrorCode(code) ? code : 'unknown', { status });
}
