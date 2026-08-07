import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const API_PREFIX = 'api';

/**
 * Called by main.ts and by the e2e suite so both exercise the same request
 * pipeline. Anything global belongs here, not in bootstrap().
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);

  // No CORS. Caddy serves web and api under one origin, so a cross-origin
  // request is a misconfiguration rather than a case to allow.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('ft_transcendence API')
    .setDescription('AI-driven foreign language learning platform')
    .setVersion('1.0')
    .build();

  // SwaggerModule does not inherit the global prefix, so the path repeats it.
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, SwaggerModule.createDocument(app, config));
}
