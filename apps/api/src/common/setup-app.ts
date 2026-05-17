import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import helmet from 'helmet';
import { ErrorReporter } from './error-reporter/error-reporter.interface';
import { ProblemDetailsExceptionFilter } from './filters/problem-details-exception.filter';
import { QueryFailedErrorFilter } from './filters/query-failed-error.filter';

/**
 * Applies global pipes, interceptors, and filters to `app`.
 *
 * Called from both `main.ts` (production) and every e2e spec, so the behaviour
 * is always identical between environments.
 *
 * Filter registration order (NestJS evaluates last-registered first for global filters):
 *   1. ProblemDetailsExceptionFilter — registered first (fallback / outermost)
 *   2. QueryFailedErrorFilter        — registered last  (wins for QueryFailedError)
 */
export function setupApp(
  app: INestApplication,
  errorReporter: ErrorReporter,
  allowedOrigin: string,
): void {
  // --------------------------------------------------------------------
  // Security headers
  // --------------------------------------------------------------------
  app.use(helmet());

  // --------------------------------------------------------------------
  // CORS — explicit allowlist driven by ALLOWED_ORIGIN env var.
  // --------------------------------------------------------------------
  app.enableCors({ origin: allowedOrigin, credentials: false });

  // --------------------------------------------------------------------
  // Interceptors
  // --------------------------------------------------------------------
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // --------------------------------------------------------------------
  // Pipes
  // --------------------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      errorHttpStatusCode: 422,
      validationError: { target: false, value: false },
      stopAtFirstError: false,
    }),
  );

  // --------------------------------------------------------------------
  // Filters — order matters: last registered = first evaluated
  // ProblemDetails must be registered before QueryFailed so that
  // QueryFailed wins the dispatch for QueryFailedError instances.
  // --------------------------------------------------------------------
  app.useGlobalFilters(
    new ProblemDetailsExceptionFilter(errorReporter),
    new QueryFailedErrorFilter(errorReporter),
  );
}
