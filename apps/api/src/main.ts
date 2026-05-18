import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { setupApp } from './common/setup-app';
import { NoopErrorReporter } from './common/error-reporter/noop-error-reporter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Use nestjs-pino as the application logger.
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);

  // Wire global pipes, interceptors, and filters.
  // In production, ErrorReporter should be obtained from DI when a real
  // provider (e.g. Sentry) is configured. For now, NoopErrorReporter is fine.
  setupApp(app, new NoopErrorReporter(), config.getOrThrow<string>('app.allowedOrigin'));

  // --------------------------------------------------------------------------
  // Swagger / OpenAPI — gated behind SWAGGER_ENABLED so it never ships in prod
  // unless explicitly opted in. The emitted spec at /docs-json is the source
  // for `pnpm openapi:generate` (consumed by packages/contracts in M4+).
  // --------------------------------------------------------------------------
  if (config.get<boolean>('features.swaggerEnabled') === true) {
    const docBuilder = new DocumentBuilder()
      .setTitle('CKM API')
      .setDescription(
        'CKM (BJJ academy management) backend. Multi-tenant per teacher; '
          + 'JWT Bearer auth with refresh-token rotation and family revocation '
          + 'on replay. All errors emit application/problem+json (RFC 7807).',
      )
      .setVersion('0.1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'bearer',
      )
      .build();
    const document = SwaggerModule.createDocument(app, docBuilder);
    SwaggerModule.setup('docs', app, document);
  }

  const port = config.getOrThrow<number>('app.port');
  await app.listen(port);
}

void bootstrap();
