/**
 * Abstraction for error reporting (Sentry, Datadog, etc.).
 * The default implementation is NoopErrorReporter.
 * Swap via DI in app.module.ts when you add a real provider.
 */
export interface ErrorReporter {
  captureException(err: unknown, context?: Record<string, unknown>): void;
}
