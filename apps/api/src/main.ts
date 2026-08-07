import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';

const DEFAULT_PORT = 3001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  // 0.0.0.0, not localhost: bound to the loopback interface the process is
  // unreachable from outside the container.
  await app.listen(Number(process.env.PORT ?? DEFAULT_PORT), '0.0.0.0');
}

void bootstrap();
