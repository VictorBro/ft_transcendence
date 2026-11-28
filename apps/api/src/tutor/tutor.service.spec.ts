import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { TutorInfo } from '@ft/shared';

import { seriesValue } from '../../test/metrics.fixtures';
import type { LlmCheck, LlmProvider } from '../llm/llm.provider';
import { llmChecks, registry } from '../metrics/metrics';
import { TutorService } from './tutor.service';

const GEMINI: TutorInfo = { provider: 'gemini', model: 'gemini-test' };
const QUOTA: LlmCheck = {
  status: 'quota_day',
  latencyMs: 12,
  httpStatus: 429,
  retryAt: '2026-11-28T08:00:00.000Z',
};

/** A provider whose check() the case controls. */
function setup(info: TutorInfo = GEMINI) {
  const check = vi.fn<() => Promise<LlmCheck>>().mockResolvedValue(QUOTA);
  const llm = { info, check } as unknown as LlmProvider;
  return { check, service: new TutorService(llm) };
}

describe('TutorService', () => {
  let error: MockInstance;

  beforeEach(() => {
    registry.resetMetrics();
    error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gives the provider and the model', () => {
    expect(setup().service.info()).toStrictEqual(GEMINI);
  });

  // Exactly these keys: Google's body, or anything else, cannot reach the browser.
  it('builds the answer from the info and the check, and nothing else', async () => {
    const { check, service } = setup();
    check.mockResolvedValueOnce({ ...QUOTA, apiKey: 'secret', body: 'project 123' } as LlmCheck);

    const answer = await service.check();

    expect(answer).toStrictEqual({
      provider: 'gemini',
      model: 'gemini-test',
      status: 'quota_day',
      latencyMs: 12,
      httpStatus: 429,
      retryAt: '2026-11-28T08:00:00.000Z',
      checkedAt: expect.any(String),
    });
    expect(new Date(answer.checkedAt).toISOString()).toBe(answer.checkedAt);
    expect(JSON.stringify(answer)).not.toContain('secret');
  });

  it('reuses one check for 15 seconds', async () => {
    const { check, service } = setup();

    const first = await service.check(0);
    const again = await service.check(14_999);

    expect(check).toHaveBeenCalledOnce();
    expect(again).toBe(first);

    await service.check(15_000);
    expect(check).toHaveBeenCalledTimes(2);
  });

  // Clicks from many accounts while Google answers share the one call.
  it('shares a check that is still running', async () => {
    const { check, service } = setup();
    let answer!: (found: LlmCheck) => void;
    check.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));

    const one = service.check(0);
    const two = service.check(1);
    answer(QUOTA);

    expect(check).toHaveBeenCalledOnce();
    expect(await one).toBe(await two);
  });

  it('checks every time with reuseMs at 0', async () => {
    const { check, service } = setup();
    service.reuseMs = 0;

    await service.check(0);
    await service.check(0);

    expect(check).toHaveBeenCalledTimes(2);
  });

  // check() must not throw; if a provider breaks that, the learner still gets a verdict.
  it('answers unexpected when the check rejects, and logs why', async () => {
    const { check, service } = setup();
    check.mockRejectedValueOnce(new Error('bug'));

    await expect(service.check()).resolves.toMatchObject({
      status: 'unexpected',
      latencyMs: null,
      httpStatus: null,
      retryAt: null,
    });
    expect(error).toHaveBeenCalledOnce();
  });

  describe('metrics', () => {
    const labels = { provider: 'gemini', model: 'gemini-test', status: 'quota_day' };

    it('starts every status at 0, then counts a fresh check', async () => {
      const { service } = setup();

      expect(await seriesValue(llmChecks, labels)).toBe(0);
      expect(await seriesValue(llmChecks, { ...labels, status: 'ok' })).toBe(0);

      await service.check(0);
      expect(await seriesValue(llmChecks, labels)).toBe(1);
    });

    // One call to the provider, one count: a reused answer reached nobody.
    it('does not count a reused answer', async () => {
      const { service } = setup();

      await service.check(0);
      await service.check(1_000);

      expect(await seriesValue(llmChecks, labels)).toBe(1);
    });

    it('labels a provider without a model "none"', async () => {
      const { check, service } = setup({ provider: 'fixture', model: null });
      check.mockResolvedValueOnce({
        status: 'fixture',
        latencyMs: null,
        httpStatus: null,
        retryAt: null,
      });

      await service.check();

      expect(
        await seriesValue(llmChecks, { provider: 'fixture', model: 'none', status: 'fixture' }),
      ).toBe(1);
    });
  });
});
