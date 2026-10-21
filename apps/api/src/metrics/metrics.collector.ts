import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { LEARNABLE_LANGUAGES, LEVELS, QUESTION_CATEGORIES } from '@ft/shared';
import { Gauge } from '@prometheus-io/client';

import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { countActiveUsers, registry } from './metrics';

/** The bank and the accounts move slowly: one query a minute, whatever the scrape rate. */
const CACHE_MS = 60_000;
/** Well inside Prometheus' 10 s scrape timeout, so a stuck database cannot drop the scrape. */
const COLLECT_TIMEOUT_MS = 3_000;

const BANK = 'ft_question_bank_questions';
const USERS = 'ft_users';
const ACTIVE_USERS = 'ft_active_users';

type BankLabel = 'lang' | 'level' | 'category' | 'source';

/**
 * Gauges read at scrape time rather than recorded as things happen. Registered
 * here, not in metrics.ts, because they need Prisma.
 */
@Injectable()
export class MetricsCollector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsCollector.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    new Gauge({
      name: BANK,
      help: 'Questions in the bank by cell and source (written, generated)',
      labelNames: ['lang', 'level', 'category', 'source'] as const,
      registers: [registry],
      collect: this.guarded(
        BANK,
        cached(CACHE_MS, (gauge: Gauge<BankLabel>) => this.countBank(gauge)),
      ),
    });
    new Gauge({
      name: USERS,
      help: 'Accounts',
      registers: [registry],
      collect: this.guarded(
        USERS,
        cached(CACHE_MS, async (gauge: Gauge) => gauge.set(await this.prisma.user.count())),
      ),
    });
    new Gauge({
      name: ACTIVE_USERS,
      help: 'Distinct signed-in users seen in the last 5 minutes',
      registers: [registry],
      collect() {
        this.set(countActiveUsers());
      },
    });
  }

  // An e2e file that builds two apps would otherwise hit "already registered".
  onModuleDestroy(): void {
    for (const name of [BANK, USERS, ACTIVE_USERS]) registry.removeSingleMetric(name);
  }

  /**
   * A collect that rejects fails the whole scrape, and one that hangs makes
   * Prometheus drop it: either way it would report "Postgres hiccupped" as
   * "the API is down". Log it and keep the last value.
   */
  private guarded<G>(name: string, collect: (gauge: G) => Promise<void>) {
    const logger = this.logger;
    return async function (this: G): Promise<void> {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`no answer in ${COLLECT_TIMEOUT_MS} ms`)),
          COLLECT_TIMEOUT_MS,
        ).unref();
      });
      try {
        await Promise.race([collect(this), timeout]);
      } catch (error) {
        logger.warn(`${name} not collected: ${String(error)}`);
      } finally {
        clearTimeout(timer);
      }
    };
  }

  /** Every cell at 0 first, so an empty one shows as the thinnest rather than not at all. */
  private async countBank(gauge: Gauge<BankLabel>): Promise<void> {
    const [written, generated] = await Promise.all([
      this.countCells({ sourceId: { not: null } }),
      this.countCells({ sourceId: null }),
    ]);
    // After both queries: a failed one must leave the last values, not zeros.
    gauge.reset();
    for (const lang of LEARNABLE_LANGUAGES) {
      for (const level of LEVELS) {
        for (const category of QUESTION_CATEGORIES) {
          gauge.set({ lang, level, category, source: 'written' }, 0);
          gauge.set({ lang, level, category, source: 'generated' }, 0);
        }
      }
    }
    for (const { lang, level, category, _count } of written) {
      gauge.set({ lang, level, category, source: 'written' }, _count._all);
    }
    for (const { lang, level, category, _count } of generated) {
      gauge.set({ lang, level, category, source: 'generated' }, _count._all);
    }
  }

  private countCells(where: Prisma.QuestionBankWhereInput) {
    return this.prisma.questionBank.groupBy({
      by: ['lang', 'level', 'category'],
      where,
      _count: { _all: true },
    });
  }
}

/**
 * Runs `collect` at most once per `ttlMs`, and never twice at once: a scrape in
 * between, or while a slow query still runs, reports the last value.
 */
function cached<G>(ttlMs: number, collect: (gauge: G) => Promise<void>) {
  let freshUntil = 0;
  let pending: Promise<void> | undefined;
  return (gauge: G): Promise<void> => {
    if (Date.now() < freshUntil || pending) return Promise.resolve();
    pending = collect(gauge)
      .then(() => {
        // Only after a success: a failed query is tried again on the next scrape.
        freshUntil = Date.now() + ttlMs;
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
}
