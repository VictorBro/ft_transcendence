import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { RedisStore } from 'connect-redis';
import session from 'express-session';
import { ZodValidationPipe } from 'nestjs-zod';

import { RedisService } from './redis/redis.service';

import { tmpdir } from 'os';
import { join } from 'path';

export const AVATAR_STORAGE_DIR = process.env.AVATAR_STORAGE_DIR ?? join(tmpdir(), 'ft-avatars');

export const API_PREFIX = 'api';

export const SESSION_COOKIE = 'ft.sid';

/** Idle timeout. `rolling` below re-arms it on every request. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function requireSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret === undefined || secret.trim().length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters. See .env.example.');
  }
  return secret;
}

/**
 * Called by main.ts and by the e2e suite so both exercise the same request
 * pipeline. Anything global belongs here, not in bootstrap().
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);

  // Caddy terminates TLS and forwards plain http, so express only learns the
  // request was secure from X-Forwarded-Proto. Without this, `cookie.secure`
  // suppresses the Set-Cookie header and nobody can log in.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Zod, not class-validator: @ft/shared owns the rules and the browser applies
  // the same ones.
  app.useGlobalPipes(new ZodValidationPipe());

  app.use(
    session({
      name: SESSION_COOKIE,
      secret: requireSessionSecret(),
      store: new RedisStore({ client: app.get(RedisService).client, prefix: 'sess:' }),
      // The cookie is an opaque id, so there is nothing to write back unless the
      // session itself changed, and an anonymous visitor gets no session at all.
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_TTL_MS,
        path: '/',
      },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('ft_transcendence API')
    .setDescription('AI-driven foreign language learning platform')
    .setVersion('1.0')
    .addCookieAuth(SESSION_COOKIE)
    .build();

  // SwaggerModule does not inherit the global prefix, so the path repeats it.
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, SwaggerModule.createDocument(app, config));
}
