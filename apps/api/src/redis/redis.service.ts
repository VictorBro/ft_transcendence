import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';

function requireRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (url === undefined || url.trim() === '') {
    throw new Error('REDIS_URL is unset: the api cannot start. See .env.example.');
  }
  return url;
}

/** Per connection attempt. Redis on the compose network answers in milliseconds. */
export const REDIS_CONNECT_TIMEOUT_MS = 5_000;

/**
 * node-redis's own default, which a custom strategy replaces: doubling from
 * 50 ms up to 2 s, plus up to 200 ms of jitter so clients do not retry in step.
 */
export function reconnectDelayMs(retries: number): number {
  return Math.min(2 ** retries * 50, 2_000) + Math.floor(Math.random() * 200);
}

/**
 * The one Redis connection. Sessions, presence, the placement run state, and
 * the lesson discussion's rate limits all share it rather than opening their own.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: RedisClientType;

  /** Set once the first connect succeeds. Before it, a failure is a bad setup. */
  private connected = false;

  constructor() {
    this.client = createClient({
      url: requireRedisUrl(),
      socket: {
        // A wrong host hangs instead of refusing, so each attempt is bounded.
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        // The timeout alone ends one attempt, and the default strategy then
        // retries forever, so `connect()` would never settle and the API would
        // hang before listening. Compose starts the API only once Redis is
        // healthy, so a first connect that fails is a wrong REDIS_URL: give up
        // and let `connect()` reject. After that, a dropped connection is an
        // outage, and the client keeps reconnecting with a backoff.
        reconnectStrategy: (retries, cause) =>
          this.connected
            ? reconnectDelayMs(retries)
            : new Error(`redis: first connect failed: ${cause.message}`),
      },
    });
    // Without a listener, a dropped connection raises an unhandled 'error' event
    // and takes the process down. Reconnection is automatic.
    this.client.on('error', (error: Error) => this.logger.error(`redis: ${error.message}`));
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    this.connected = true;
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
