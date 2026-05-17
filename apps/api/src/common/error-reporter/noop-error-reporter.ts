import { Injectable } from '@nestjs/common';
import { ErrorReporter } from './error-reporter.interface';

/**
 * No-op error reporter used in development and as the default.
 * Replace with SentryErrorReporter (or similar) when ready.
 */
@Injectable()
export class NoopErrorReporter implements ErrorReporter {
  captureException(_err: unknown, _context?: Record<string, unknown>): void {
    // intentional no-op
  }
}
