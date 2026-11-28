import { Inject, Injectable, Logger } from '@nestjs/common';
import { TUTOR_CHECK_STATUSES, type TutorCheck, type TutorInfo } from '@ft/shared';

import { LLM_PROVIDER, type LlmCheck, type LlmProvider } from '../llm/llm.provider';
import { llmChecks } from '../metrics/metrics';

/**
 * Tells what the lesson tutor runs on, and checks the server's key on demand.
 * The provider does the call; this service shares one check between every
 * account, counts it, and builds the answer from known fields only.
 */
@Injectable()
export class TutorService {
  private readonly logger = new Logger(TutorService.name);
  /**
   * How long one check answers for everyone. Public so the e2e suite can set it
   * to 0, as discussion.e2e-spec does with the discussion limits.
   */
  reuseMs = 15_000;
  /** The last check started, kept as its promise so a check still running is shared too. */
  private last: { startedAt: number; result: Promise<TutorCheck> } | null = null;

  constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider) {
    // Every status starts at 0: a counter that appears at 1 hides its first
    // increment from Prometheus' rate().
    const { provider, model } = llm.info;
    for (const status of TUTOR_CHECK_STATUSES) {
      llmChecks.inc({ provider, model: model ?? 'none', status }, 0);
    }
  }

  /** A copy, so no caller can change what the provider holds. */
  info(): TutorInfo {
    return { ...this.llm.info };
  }

  /**
   * The last check if it started less than reuseMs ago, finished or not, so
   * clicks from many accounts share one call to Google. Never rejects.
   * `now` is a parameter so the spec can move the clock.
   */
  check(now = Date.now()): Promise<TutorCheck> {
    if (this.last && now - this.last.startedAt < this.reuseMs) return this.last.result;
    const result = this.run();
    this.last = { startedAt: now, result };
    return result;
  }

  private async run(): Promise<TutorCheck> {
    const { provider, model } = this.llm.info;
    // check() must not throw. If a provider breaks that promise, the learner
    // still gets a verdict, and the log keeps the bug.
    const found = await this.llm.check().catch((error: unknown): LlmCheck => {
      this.logger.error(error);
      return { status: 'unexpected', latencyMs: null, httpStatus: null, retryAt: null };
    });
    llmChecks.inc({ provider, model: model ?? 'none', status: found.status });
    // Each field picked by name: nothing else a provider returns can reach the browser.
    return {
      provider,
      model,
      status: found.status,
      latencyMs: found.latencyMs,
      httpStatus: found.httpStatus,
      retryAt: found.retryAt,
      checkedAt: new Date().toISOString(),
    };
  }
}
