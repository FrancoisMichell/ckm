import { Global, Module } from '@nestjs/common';
import { NoopErrorReporter } from './noop-error-reporter';

/**
 * Provides the `ErrorReporter` token application-wide.
 *
 * Declared @Global() so child modules (AuthModule, future feature modules)
 * can resolve `@Inject('ErrorReporter')` without re-declaring the provider
 * — a single binding here is the only switch when the day comes to replace
 * NoopErrorReporter with a real reporter (Sentry, Datadog, ...).
 *
 * Filters (ProblemDetailsExceptionFilter, QueryFailedErrorFilter) take an
 * `ErrorReporter` through their constructor and are still wired in
 * setupApp() with a hand-constructed NoopErrorReporter — global DI does
 * not reach those because they are instantiated outside the Nest container.
 * That is fine; the global provider exists for *services* that need it.
 */
@Global()
@Module({
  providers: [{ provide: 'ErrorReporter', useClass: NoopErrorReporter }],
  exports: ['ErrorReporter'],
})
export class ErrorReporterModule {}
