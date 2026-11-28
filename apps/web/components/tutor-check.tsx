'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { TutorCheck as TutorCheckData, TutorInfo } from '@ft/shared';

import { useErrorMessage } from '@/lib/error-message';
import { checkTutor, loadTutorInfo } from '@/lib/tutor-client';
import { STATUS_TONE, TONE_CLASS, type Tone } from '@/lib/tutor-status';
import { FormError, SECONDARY_BUTTON } from '@/components/form';

/** Not loaded yet, or the load failed: the test still works, and its answer fills this in. */
type Info = TutorInfo | 'loading' | 'failed';

/**
 * The AI tutor part of /profile: what the tutor runs on, and a button that
 * tests the server's key. Every learner shares that one key, so a wrong key, a
 * wrong model and a Google outage all read "the tutor cannot answer" in a
 * lesson; this tells them apart.
 */
export function TutorCheck() {
  const t = useTranslations('TutorCard');
  const errorMessage = useErrorMessage();
  const [info, setInfo] = useState<Info>('loading');
  const [result, setResult] = useState<TutorCheckData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void loadTutorInfo().then((response) => setInfo(response.ok ? response.data : 'failed'));
  }, []);

  async function test() {
    // aria-disabled keeps the button focusable, so it still gets clicks: ignore them.
    if (pending) {
      return;
    }
    setPending(true);
    // Cleared first, so the live region changes and a reused result is announced again.
    setResult(null);
    setError(null);
    try {
      const response = await checkTutor();
      if (response.ok) {
        setResult(response.data);
        setInfo({ provider: response.data.provider, model: response.data.model });
      } else {
        // 429 after 3 tests a minute, 401 once the session ended, or no network.
        setError(errorMessage(response.code, response.status));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      {info === 'failed' ? null : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate-400">{t('provider')}</dt>
          <dd className="min-w-0">
            {info === 'loading' ? t('loading') : t(`providers.${info.provider}`)}
          </dd>
          {info !== 'loading' && info.model !== null ? (
            <>
              <dt className="text-slate-400">{t('model')}</dt>
              <dd className="min-w-0">
                <code className="font-mono text-xs break-all">{info.model}</code>
              </dd>
            </>
          ) : null}
        </dl>
      )}
      {/* aria-disabled, not disabled: a disabled button drops the focus of whoever pressed it. */}
      <button
        type="button"
        onClick={() => void test()}
        aria-disabled={pending}
        className={`${SECONDARY_BUTTON} self-start aria-disabled:cursor-wait aria-disabled:opacity-60`}
      >
        {pending ? t('testing') : t('test')}
      </button>
      {/* Always in the page: a live region added with its text may not be read out. */}
      <div role="status" className="min-h-5">
        {result ? <TutorCheckResult result={result} /> : null}
      </div>
      <FormError message={error} />
    </div>
  );
}

/**
 * One check's verdict: an icon, the sentence in the tone's colour, what to do
 * about it, and when it ran. Rendered only after a click, so the time, in the
 * browser's own zone, never differs between the server and the browser.
 */
export function TutorCheckResult({ result }: { result: TutorCheckData }) {
  const t = useTranslations('TutorCard');
  const locale = useLocale();
  const tone = STATUS_TONE[result.status];
  // The api gives no HTTP status when the check itself failed: there is no answer to name.
  // An unreachable with one is Google's 408 or 5xx: it did answer, with its own trouble.
  const sentence =
    result.status === 'unexpected' && result.httpStatus === null
      ? 'unexpectedNoAnswer'
      : result.status === 'unreachable' && result.httpStatus !== null
        ? 'unreachableHttp'
        : result.status;
  const time = new Date(result.checkedAt).toLocaleTimeString(locale);
  // When Google said the quota comes back (quota_day's hint), to the minute only:
  // Google's wait is counted from the check, so its seconds mean nothing.
  const resetTime =
    result.retryAt === null
      ? ''
      : new Date(result.retryAt).toLocaleTimeString(locale, {
          hour: 'numeric',
          minute: '2-digit',
        });

  return (
    <div className="flex items-start gap-3 text-sm">
      <ToneIcon tone={tone} />
      <div className="flex min-w-0 flex-col gap-1 wrap-break-word">
        <p className={TONE_CLASS[tone]}>
          {t(`status.${sentence}`, {
            model: result.model ?? '',
            status: result.httpStatus ?? 0,
          })}
        </p>
        <p className="text-slate-400">
          {t(`hint.${result.status}`, {
            hasTime: result.retryAt === null ? 'no' : 'yes',
            time: resetTime,
          })}
        </p>
        {/* No HTTP status: Google never answered, so the time taken is no answer time. */}
        <p className="text-xs text-slate-500">
          {result.latencyMs === null || result.httpStatus === null
            ? t('checkedAt', { time })
            : t('answeredIn', { ms: result.latencyMs, time })}
        </p>
      </div>
    </div>
  );
}

/** The mark inside each circle. Its shape tells the tone apart too, not only its colour. */
const MARKS: Record<Tone, ReactNode> = {
  good: <path d="m8 12 3 3 5-6" />,
  warn: <path d="M12 7v5l3 2" />,
  bad: <path d="m9 9 6 6m0-6-6 6" />,
  info: (
    <>
      <path d="M12 11v6" />
      <path d="M12 7h.01" />
    </>
  ),
};

/** Decorative: the sentence next to it says the same. */
function ToneIcon({ tone }: { tone: Tone }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-6 shrink-0 ${TONE_CLASS[tone]}`}
      data-tone={tone}
    >
      <circle cx={12} cy={12} r={9} />
      {MARKS[tone]}
    </svg>
  );
}
