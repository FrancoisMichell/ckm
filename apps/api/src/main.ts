import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { setupApp } from './common/setup-app';
import { NoopErrorReporter } from './common/error-reporter/noop-error-reporter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Use nestjs-pino as the application logger.
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);

  // --------------------------------------------------------------------------
  // Migration runner (sub-step 8.5) — gated by RUN_MIGRATIONS=true.
  // When set, pending TypeORM migrations are applied before the server
  // starts listening. This lets a container (or start:dev) auto-migrate on
  // boot without coupling migration logic to app startup unconditionally.
  //
  // NEVER runs in test (NODE_ENV=test) — the e2e suite manages its own schema
  // via the postgres-test container.
  // --------------------------------------------------------------------------
  if (config.get<boolean>('app.runMigrations') === true) {
    const dataSource = app.get<DataSource>(getDataSourceToken());
    await dataSource.runMigrations({ transaction: 'each' });
  }

  // Wire global pipes, interceptors, and filters.
  // In production, ErrorReporter should be obtained from DI when a real
  // provider (e.g. Sentry) is configured. For now, NoopErrorReporter is fine.
  setupApp(app, new NoopErrorReporter(), config.getOrThrow<string>('app.allowedOrigin'));

  // --------------------------------------------------------------------------
  // Swagger / OpenAPI (sub-step 8.3) — mounted at /api.
  // Gated behind SWAGGER_ENABLED so it never ships in prod unless explicitly
  // opted in. The emitted spec at /api-json is the source for
  // `pnpm openapi:generate` (consumed by packages/contracts in M10+).
  // When SWAGGER_ENABLED is absent or false, visiting /api returns 404.
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
    SwaggerModule.setup('api', app, document);
  }

  const port = config.getOrThrow<number>('app.port');
  await app.listen(port);
}

void bootstrap();
