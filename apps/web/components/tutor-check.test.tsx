import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TUTOR_CHECK_STATUSES, type TutorCheck as TutorCheckData } from '@ft/shared';

import en from '@/messages/en.json';
import { TutorCheck, TutorCheckResult } from './tutor-check';

/**
 * The AI tutor part of /profile, as the server draws it: no DOM and no effect,
 * as the other component tests. So TutorCheck is seen before its load, and
 * each verdict is rendered on its own (TutorCheckResult), as the page draws
 * it after a click.
 */
const html = (node: ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );

const result = (change: Partial<TutorCheckData> = {}): TutorCheckData => ({
  provider: 'gemini',
  model: 'gemini-test-model',
  status: 'ok',
  latencyMs: 171,
  httpStatus: 200,
  retryAt: null,
  checkedAt: '2026-11-27T10:00:00.000Z',
  ...change,
});

describe('TutorCheck', () => {
  it('offers the test, keeps the live region in the page, and says it is loading', () => {
    const out = html(<TutorCheck />);

    expect(out).toContain('Test connection');
    expect(out).toContain('type="button"');
    expect(out).toContain('role="status"');
    expect(out).toContain('Loading…');
    expect(out).not.toContain('aria-disabled="true"');
  });
});

describe('TutorCheckResult', () => {
  it.each(TUTOR_CHECK_STATUSES)('has a sentence and a hint for %s', (status) => {
    const out = html(<TutorCheckResult result={result({ status })} />);

    expect(out).not.toContain('TutorCard.');
    expect(out).toMatch(/<svg [^>]*aria-hidden="true"/);
  });

  // The test asks the model for one word: ok means a learner would get an answer too.
  it('says Google answered the test, and what the test spends', () => {
    const out = html(<TutorCheckResult result={result()} />);

    expect(out).toContain('Working: Google answered a test message.');
    expect(out).toContain('Each test uses one request of the key&#x27;s quota for today.');
    expect(out).toContain('text-green-400');
  });

  it('tells the quota of the minute from the quota of the day', () => {
    const minute = html(<TutorCheckResult result={result({ status: 'quota', httpStatus: 429 })} />);

    expect(minute).toContain('The key is over its per-minute quota.');
    expect(minute).toContain('The tutor answers again within a minute.');
    expect(minute).toContain('text-amber-300');
  });

  // The same sentence a learner reads in the lesson (Errors.llm.quotaExhausted).
  it('says the quota of the day is used up, in red, and when Google resets it', () => {
    const retryAt = '2026-11-28T08:00:00.000Z';
    const out = html(
      <TutorCheckResult result={result({ status: 'quota_day', httpStatus: 429, retryAt })} />,
    );
    const time = new Date(retryAt).toLocaleTimeString('en', {
      hour: 'numeric',
      minute: '2-digit',
    });

    expect(out).toContain('The tutor has used up today&#x27;s quota. It&#x27;s back tomorrow.');
    expect(out).toContain(`Google resets it around ${time}.`);
    expect(out).toContain('text-red-400');
  });

  it('names the usual reset when Google gave no time', () => {
    const out = html(
      <TutorCheckResult result={result({ status: 'quota_day', httpStatus: 429, retryAt: null })} />,
    );

    expect(out).toContain('Google resets it at midnight Pacific time.');
    expect(out).not.toContain('around');
  });

  it('says the key was refused, in red', () => {
    const out = html(
      <TutorCheckResult result={result({ status: 'invalid_key', httpStatus: 400 })} />,
    );

    expect(out).toContain('Google refused the key.');
    expect(out).toContain('text-red-400');
  });

  it('names the model it could not find', () => {
    const out = html(
      <TutorCheckResult result={result({ status: 'model_not_found', httpStatus: 404 })} />,
    );

    expect(out).toContain('gemini-test-model');
  });

  it("gives Google's HTTP status for an answer it did not expect", () => {
    const out = html(
      <TutorCheckResult result={result({ status: 'unexpected', httpStatus: 402 })} />,
    );

    expect(out).toContain('HTTP 402');
  });

  // The provider's check threw, so Google never answered: there is no status to give.
  it('says the test failed before Google answered when there is no HTTP status', () => {
    const out = html(
      <TutorCheckResult
        result={result({ status: 'unexpected', latencyMs: null, httpStatus: null })}
      />,
    );

    expect(out).toContain('The test failed before Google answered.');
    expect(out).not.toContain('HTTP 0');
  });

  it('says how long Google took', () => {
    const out = html(<TutorCheckResult result={result()} />);

    expect(out).toContain('Answered in 171 ms');
  });

  // The api still times a check that got no answer (the 30 s timeout, no network): no answer time.
  it('gives no answer time when Google did not answer', () => {
    const out = html(
      <TutorCheckResult
        result={result({ status: 'unreachable', latencyMs: 30001, httpStatus: null })}
      />,
    );

    expect(out).toContain('Google did not answer in time.');
    expect(out).toContain('Checked at');
    expect(out).not.toContain('Answered in');
  });

  // A 5xx is unreachable too, but Google did answer: name its status, not a timeout.
  it("gives Google's HTTP status for its own trouble", () => {
    const out = html(
      <TutorCheckResult
        result={result({ status: 'unreachable', latencyMs: 312, httpStatus: 503 })}
      />,
    );

    expect(out).toContain('HTTP 503');
    expect(out).not.toContain('did not answer');
    expect(out).toContain('Answered in 312 ms');
  });

  // No call was made, so there is no time to give, only when it was checked.
  it('gives only the time of a check that called no one', () => {
    const out = html(
      <TutorCheckResult
        result={result({
          provider: 'fixture',
          model: null,
          status: 'fixture',
          latencyMs: null,
          httpStatus: null,
        })}
      />,
    );

    expect(out).toContain('Checked at');
    expect(out).not.toContain(' ms');
  });
});
