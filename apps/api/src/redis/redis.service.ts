import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';

function requireRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (url === undefined || url.trim() === '') {
    throw new Error('REDIS_URL is unset: the api cannot start. See .env.example.');
  }
  return url;
}

/**
 * The one Redis connection. Sessions, and later the socket.io adapter and the
 * throttler, all share it rather than opening their own.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: RedisClientType;

  constructor() {
    // A wrong host hangs instead of refusing, so bound it: five seconds turns a
    // misconfiguration into a startup error rather than a stuck container.
    this.client = createClient({
      url: requireRedisUrl(),
      socket: { connectTimeout: 5_000 },
    });
    // Without a listener, a dropped connection raises an unhandled 'error' event
    // and takes the process down. Reconnection is automatic.
    this.client.on('error', (error: Error) => this.logger.error(`redis: ${error.message}`));
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    this.logger.log('redis connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }

  /** Round-trip for the health endpoint, in milliseconds. */
  async ping(): Promise<number> {
    const startedAt = process.hrtime.bigint();
    await this.client.ping();
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  }
}
