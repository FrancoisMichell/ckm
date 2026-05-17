import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { setupApp } from './common/setup-app';
import { NoopErrorReporter } from './common/error-reporter/noop-error-reporter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Use nestjs-pino as the application logger.
  app.useLogger(app.get(Logger));

  // Wire global pipes, interceptors, and filters.
  // In production, ErrorReporter should be obtained from DI when a real
  // provider (e.g. Sentry) is configured. For now, NoopErrorReporter is fine.
  setupApp(app, new NoopErrorReporter());

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
}

void bootstrap();
