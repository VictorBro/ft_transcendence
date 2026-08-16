import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { API_PREFIX, AVATAR_STORAGE_DIR, configureApp } from './app.setup';

const DEFAULT_PORT = 3001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  // /api/uploads/avatars/xxx.png -> /data/avatars/xxx.png on disk. The prefix
  // carries the global "api" prefix explicitly: useStaticAssets does not
  // inherit setGlobalPrefix().
  app.useStaticAssets(AVATAR_STORAGE_DIR, { prefix: `/${API_PREFIX}/uploads/avatars` });

  // 0.0.0.0, not localhost: bound to the loopback interface the process is
  // unreachable from outside the container.
  await app.listen(Number(process.env.PORT ?? DEFAULT_PORT), '0.0.0.0');
}

void bootstrap();
