import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
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

  const port = config.getOrThrow<number>('app.port');
  await app.listen(port);
}

void bootstrap();
