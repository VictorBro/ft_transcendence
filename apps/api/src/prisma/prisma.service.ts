import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

/**
 * The only place the Prisma client is instantiated. Everything that touches the
 * database injects this, so connection lifetime and logging are decided once.
 *
 * The adapter is mandatory, not a tuning choice: the `prisma-client` generator
 * emits the Rust-free client, which has no query engine of its own and drives
 * node-postgres instead. `new PrismaClient()` with no adapter throws at
 * construction.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Read here rather than through ConfigService: the client is constructed
    // before Nest resolves providers, and prisma.config.ts reads the same
    // variable for the CLI, so the two cannot point at different databases.
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  /**
   * Connecting during bootstrap rather than lazily on the first query: a bad
   * DATABASE_URL then fails the container's start instead of the first request
   * a user makes, which is what the compose healthcheck is there to catch.
   */
  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Round-trip used by the health endpoint. Returns the latency so a database
   * that answers but answers slowly is visible rather than reported as "ok".
   */
  async ping(): Promise<number> {
    const startedAt = process.hrtime.bigint();
    await this.$queryRaw`SELECT 1`;
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  }
}
