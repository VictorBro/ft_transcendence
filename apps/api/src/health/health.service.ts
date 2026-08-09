import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DependencyHealth, HealthStatus } from '@ft/shared';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { HealthResponseDto } from './dto/health-response.dto';

/** Above this a dependency answers, but not well enough to call healthy. */
export const SLOW_DEPENDENCY_MS = 250;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Never throws. A probe that rejects is a `down` dependency, not a 500: the
   * point of this endpoint is to report the failure, and an exception here would
   * make the container look dead when only Postgres is.
   */
  private async probe(name: DependencyHealth['name'], run: () => Promise<number>) {
    try {
      const latencyMs = await run();
      return {
        name,
        status: latencyMs > SLOW_DEPENDENCY_MS ? 'degraded' : 'ok',
        latencyMs,
      } satisfies DependencyHealth;
    } catch (error) {
      this.logger.warn(`${name} probe failed: ${error instanceof Error ? error.message : error}`);
      return { name, status: 'down', latencyMs: 0 } satisfies DependencyHealth;
    }
  }

  /** Worst dependency wins, so one `down` cannot hide behind several `ok`s. */
  private static rollUp(dependencies: DependencyHealth[]): HealthStatus {
    if (dependencies.some((dependency) => dependency.status === 'down')) {
      return 'down';
    }
    return dependencies.some((dependency) => dependency.status === 'degraded') ? 'degraded' : 'ok';
  }

  async check(): Promise<HealthResponseDto> {
    // Probed together: one slow dependency should not add its latency to the
    // other's reported number.
    const dependencies = await Promise.all([
      this.probe('database', () => this.prisma.ping()),
      this.probe('redis', () => this.redis.ping()),
    ]);

    return {
      status: HealthService.rollUp(dependencies),
      service: 'api',
      version: this.config.get<string>('APP_VERSION', '0.0.0'),
      uptimeSeconds: Math.floor(process.uptime()),
      checkedAt: new Date().toISOString(),
      dependencies,
    };
  }
}
