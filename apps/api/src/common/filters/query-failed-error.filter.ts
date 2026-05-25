import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { ErrorReporter } from '../error-reporter/error-reporter.interface';

/**
 * Maps named Postgres constraint violations to structured `application/problem+json`
 * responses, avoiding scattered `try/catch` on `error.code === '23505'` in services.
 *
 * The constraint map is populated incrementally as migrations land — one entry per
 * named constraint. See `docs/api/06-database-and-migrations.md` for the full table.
 *
 * Unknown constraints (or errors without a `constraint` property) return 500 and are
 * forwarded to `ErrorReporter` for visibility.
 *
 * Registration order: this filter must be registered LAST in `setupApp()` so that
 * NestJS dispatches `QueryFailedError` here before falling through to
 * `ProblemDetailsExceptionFilter`.
 */
@Catch(QueryFailedError)
export class QueryFailedErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(QueryFailedErrorFilter.name);

  /**
   * Constraint name → HTTP response shape.
   * Add one entry per named constraint introduced by a migration.
   */
  private readonly constraintMap: Record<
    string,
    { status: number; title: string; detail: string }
  > = {
    // M3a — users + user_roles
    // uq_users_registry was replaced by the partial index uq_users_registry_active (migration 2)
    uq_users_registry_active: {
      status: 409,
      title: 'Registry already in use',
      detail: 'A user with this registry already exists.',
    },
    uq_user_roles_user_role: {
      status: 409,
      title: 'Duplicate role',
      detail: 'This user already has the requested role.',
    },
    // M5 — classes + enrollments
    chk_classes_duration: {
      status: 422,
      title: 'Invalid class duration',
      detail: 'durationMinutes must be between 30 and 300.',
    },
    fk_classes_teacher_id: {
      status: 422,
      title: 'Invalid teacher',
      detail: 'The referenced teacher does not exist.',
    },
    fk_class_enrollments_class: {
      status: 422,
      title: 'Invalid class',
      detail: 'The referenced class does not exist.',
    },
    fk_class_enrollments_user: {
      status: 422,
      title: 'Invalid student',
      detail: 'The referenced student does not exist.',
    },
    uq_class_enrollments_active: {
      status: 409,
      title: 'Already enrolled',
      detail: 'This student is already enrolled in this class.',
    },
    // M6 — class_sessions
    uq_class_sessions_class_date_active: {
      status: 409,
      title: 'Duplicate session',
      detail: 'A session already exists for this class on this date.',
    },
    fk_class_sessions_class: {
      status: 422,
      title: 'Invalid class',
      detail: 'The referenced class does not exist.',
    },
    // M7 — attendances
    uq_attendances_session_student_active: {
      status: 409,
      title: 'Duplicate attendance',
      detail: 'This student already has an attendance record for this session.',
    },
    fk_attendances_session: {
      status: 422,
      title: 'Invalid session',
      detail: 'The referenced session does not exist.',
    },
    fk_attendances_student: {
      status: 422,
      title: 'Invalid student',
      detail: 'The referenced student does not exist.',
    },
  };

  constructor(private readonly reporter: ErrorReporter) {}

  catch(ex: QueryFailedError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const constraint = (ex.driverError as { constraint?: string }).constraint;
    const known = constraint ? this.constraintMap[constraint] : undefined;

    if (!known) {
      // Unknown or unnamed constraint — treat as 500.
      this.logger.error(
        { err: ex, constraint, path: req.url },
        'Unhandled QueryFailedError',
      );
      this.reporter.captureException(ex, { constraint, path: req.url });

      res
        .status(500)
        .type('application/problem+json')
        .json({
          type: 'https://api.ckm.dev/problems/internal-server-error',
          title: 'Internal Server Error',
          status: 500,
          detail: 'An unexpected database error occurred.',
          instance: req.url,
        });
      return;
    }

    const { status, title, detail } = known;

    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: `https://api.ckm.dev/problems/${slugify(title)}`,
        title,
        status,
        detail,
        instance: req.url,
      });
  }
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
