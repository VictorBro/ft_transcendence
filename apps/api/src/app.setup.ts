import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { RedisStore } from 'connect-redis';
import session from 'express-session';
import { cleanupOpenApiDoc, ZodValidationPipe } from 'nestjs-zod';

import { RedisService } from './redis/redis.service';

/**
 * Required like DATABASE_URL: a temp-directory default would accept uploads,
 * store the url, and lose the file on the next restart without saying so.
 */
export const AVATAR_STORAGE_DIR = requireAvatarStorageDir();

function requireAvatarStorageDir(): string {
  const dir = process.env.AVATAR_STORAGE_DIR;
  if (dir === undefined || dir.trim() === '') {
    throw new Error('AVATAR_STORAGE_DIR is unset: the api cannot start. See compose.yml.');
  }
  return dir;
}

export const API_PREFIX = 'api';

/** Repeats "api": useStaticAssets does not inherit setGlobalPrefix. */
export const AVATAR_ROUTE = `/${API_PREFIX}/uploads/avatars`;

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

  // Here rather than in bootstrap() so the Supertest suite can reach it.
  (app as NestExpressApplication).useStaticAssets(AVATAR_STORAGE_DIR, { prefix: AVATAR_ROUTE });

  // Caddy terminates TLS and forwards plain http, so express only learns the
  // request was secure from X-Forwarded-Proto. Without this, `cookie.secure`
  // suppresses the Set-Cookie header and nobody can log in.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Zod, not class-validator: @ft/shared owns the rules and the browser applies
  // the same ones.
  //
  // Every `message` this API returns is an ERROR_CODES entry, never a
  // sentence, whether it comes from this pipe or a thrown HttpException. The reader's
  // language is known in the browser and nowhere near here, so the wording is
  // chosen there; see apps/web/lib/error-message.ts.
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
    .setDescription(
      'AI-driven foreign language learning platform.\n\n' +
        'Errors carry an ERROR_CODES entry as `message`, never a sentence: the browser ' +
        'translates the code. See packages/shared/src/schemas/errors.ts for the list.',
    )
    .setVersion(process.env.APP_VERSION ?? '0.0.0')
    // Registered under the name `cookie`, which is what the decorators reference.
    .addCookieAuth(SESSION_COOKIE)
    // AuthGuard is global, so the document is deny-by-default too. @Public()
    // routes clear it with `security: []`.
    .addSecurityRequirements('cookie')
    .build();

  // SwaggerModule does not inherit the global prefix, so the path repeats it.
  // cleanupOpenApiDoc strips nestjs-zod's internal extensions and the 3.1 null
  // syntax it emits, which are invalid under the 3.0.0 header.
  SwaggerModule.setup(
    `${API_PREFIX}/docs`,
    app,
    cleanupOpenApiDoc(SwaggerModule.createDocument(app, config)),
  );
}
