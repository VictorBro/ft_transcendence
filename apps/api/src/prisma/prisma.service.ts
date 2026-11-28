import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

/**
 * Validated before the client is constructed. Left undefined, node-postgres
 * falls back to its own PG* defaults and eventually fails with a connection
 * error naming localhost, which sends whoever is debugging a container to
 * entirely the wrong place.
 *
 * A free function because it runs inside the `super(...)` arguments, before
 * `this` exists, so it cannot be an instance method.
 */
function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    throw new Error('DATABASE_URL is unset: the api cannot start. See compose.yml.');
  }
  return url;
}

/** Per new connection. Postgres on the compose network answers in milliseconds. */
export const DATABASE_CONNECT_TIMEOUT_MS = 5_000;

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
    // Read from the environment rather than through ConfigService: the client is
    // constructed before Nest resolves providers, and prisma.config.ts reads the
    // same variable for the CLI, so the two cannot point at different databases.
    //
    // node-postgres waits forever for a connection by default, so a host that
    // drops packets would hang the start check below until the kernel gives up.
    super({
      adapter: new PrismaPg({
        connectionString: requireDatabaseUrl(),
        connectionTimeoutMillis: DATABASE_CONNECT_TIMEOUT_MS,
      }),
    });
  }

  /**
   * Checked during bootstrap rather than on the first query: a bad DATABASE_URL
   * then stops the API at start instead of failing the first request a user
   * makes.
   *
   * `$connect()` alone proves nothing: with the pg adapter it only builds a
   * `pg.Pool`, and a pool opens no connection before its first query. The
   * round-trip is what reaches Postgres. Its rejection propagates out of
   * `app.listen`, so the process exits before it listens.
   */
  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.$queryRaw`SELECT 1`;
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
