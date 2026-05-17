import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorReporter } from '../error-reporter/error-reporter.interface';

/**
 * Converts any exception into an RFC 7807 `application/problem+json` response.
 *
 * For `HttpException`, the status/title/detail are derived from the exception body.
 * For unknown errors, the exception is reported via `ErrorReporter` and a generic
 * 500 response is returned — no implementation details are leaked.
 *
 * Registration order: this filter must be registered BEFORE `QueryFailedErrorFilter`
 * in `setupApp()` so that `QueryFailedErrorFilter` (registered last) wins the dispatch
 * for `QueryFailedError` instances.
 */
@Catch()
export class ProblemDetailsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsExceptionFilter.name);

  constructor(private readonly reporter: ErrorReporter) {}

  catch(ex: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail = 'An unexpected error occurred.';
    let errors: { field: string; message: string }[] | undefined;

    if (ex instanceof HttpException) {
      status = ex.getStatus();
      const body = ex.getResponse();

      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        title = typeof b['error'] === 'string' ? b['error'] : ex.name;
        const msg = b['message'];
        if (Array.isArray(msg)) {
          detail = 'One or more fields failed validation.';
          if (status === 422) {
            errors = parseValidationErrors(msg as string[]);
          }
        } else {
          detail = typeof msg === 'string' ? msg : detail;
        }
      } else if (typeof body === 'string') {
        detail = body;
        title = ex.name;
      }
    } else {
      // Non-HttpException: report and respond with generic 500.
      this.logger.error(
        { err: ex, path: req.url },
        'Unhandled exception',
      );
      this.reporter.captureException(ex, { path: req.url });
    }

    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: `https://api.ckm.dev/problems/${slugify(title)}`,
        title,
        status,
        detail,
        instance: req.url,
        ...(errors !== undefined ? { errors } : {}),
      });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parses class-validator validation messages.
 * Each entry may be plain string or a nested constraint object.
 */
function parseValidationErrors(
  messages: string[],
): { field: string; message: string }[] {
  return messages.map((msg) => {
    // class-validator shapes messages as "fieldName: constraint1, constraint2"
    const colonIdx = msg.indexOf(':');
    if (colonIdx !== -1) {
      return {
        field: msg.slice(0, colonIdx).trim(),
        message: msg.slice(colonIdx + 1).trim(),
      };
    }
    return { field: 'unknown', message: msg };
  });
}

/**
 * Converts a title string into a URL-safe slug, e.g. "Not Found" → "not-found".
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
