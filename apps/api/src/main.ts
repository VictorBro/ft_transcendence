import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { collectDefaultMetrics } from '@prometheus-io/client';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { appInfo, registry } from './metrics/metrics';
import { METRICS_PORT, startMetricsServer } from './metrics/metrics-server';

const DEFAULT_PORT = 3001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  // 0.0.0.0, not localhost: bound to the loopback interface the process is
  // unreachable from outside the container.
  await app.listen(Number(process.env.PORT ?? DEFAULT_PORT), '0.0.0.0');

  // After listen: a boot that fails never leaves a metrics port answering.
  collectDefaultMetrics({ register: registry });
  appInfo.set({ version: process.env.APP_VERSION ?? '0.0.0' }, 1);
  // Logged, not thrown: monitoring must never take the app down. Prometheus
  // then reports the api as down, which is the right alarm.
  startMetricsServer(METRICS_PORT).catch((error: unknown) =>
    new Logger('Metrics').error(`metrics listener failed: ${String(error)}`),
  );
}

void bootstrap();
