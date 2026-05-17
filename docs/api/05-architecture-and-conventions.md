# 05 — Architecture & Conventions

## Repository layout

```
seirin-v2/
├── CLAUDE.md
├── .env.example
├── .env.test
├── compose.yaml              # postgres + postgres-test
├── Dockerfile                # multi-stage builder → runtime
├── eslint.config.mjs
├── nest-cli.json
├── package.json
├── tsconfig.json
├── config/
│   └── configuration.ts      # @nestjs/config factory + Joi schema
├── db/
│   ├── datasource.ts         # TypeORM DataSource for CLI + AppModule
│   ├── migrations/           # Generated migrations (one per logical change)
│   └── seeds/                # Dev/test seed scripts
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/               # Shared utilities (NOT a feature module)
│   │   ├── CLAUDE.md
│   │   ├── decorators.ts
│   │   ├── enums.ts
│   │   ├── interfaces/       # RequestWithUser, PaginatedResponse, etc.
│   │   ├── dto/              # IncludeDeletedDto, etc.
│   │   ├── utils/            # EntityUtil, PasswordService
│   │   ├── filters/          # ProblemDetailsExceptionFilter, QueryFailedErrorFilter
│   │   ├── logger/           # nestjs-pino config
│   │   ├── error-reporter/   # ErrorReporter interface + NoopErrorReporter
│   │   └── setup-app.ts      # Global pipes + interceptors + filters
│   ├── auth/
│   │   ├── CLAUDE.md
│   │   ├── auth.controller.ts   # /auth/login, /refresh, /logout, /me
│   │   ├── auth.service.ts
│   │   ├── auth.module.ts
│   │   ├── strategies/{jwt,local}.strategy.ts
│   │   ├── guards/{jwt-auth,local-auth,roles}.guard.ts
│   │   └── entities/refresh-token.entity.ts
│   ├── users/                # User + UserRole; not directly exposed
│   │   ├── CLAUDE.md
│   │   ├── entities/{user,user-role}.entity.ts
│   │   ├── users.service.ts
│   │   ├── users.module.ts
│   │   └── dto/query-users.dto.ts
│   ├── teachers/             # Teacher-specific operations (profile, list teachers if added)
│   │   └── CLAUDE.md
│   ├── students/
│   │   ├── CLAUDE.md
│   │   ├── students.controller.ts
│   │   ├── students.service.ts
│   │   ├── students.module.ts
│   │   └── dto/
│   ├── classes/
│   │   ├── CLAUDE.md
│   │   ├── entities/class.entity.ts
│   │   └── ...
│   ├── class-sessions/
│   │   └── CLAUDE.md
│   ├── attendances/
│   │   └── CLAUDE.md
│   └── health/
│       └── health.controller.ts
└── test/
    ├── jest-e2e.json
    └── **/*.e2e-spec.ts
```

## Module template

Each feature module follows this shape (no custom repository classes — use `@InjectRepository` directly):

```ts
// classes/classes.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([Class])],
  controllers: [ClassesController],
  providers: [ClassesService],
  exports: [ClassesService],  // only if another module needs it
})
export class ClassesModule {}
```

Services depend on repositories and on `PasswordService` / `EntityUtil` from `common/`. No service-to-service circular imports — if two modules need each other, push the shared logic into `common/` or restructure.

## Global app setup (`common/setup-app.ts`)

```ts
export function setupApp(app: INestApplication, errorReporter: ErrorReporter) {
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    errorHttpStatusCode: 422,                   // RFC 7807-friendly
    validationError: { target: false, value: false },
    stopAtFirstError: false,
  }));

  app.useGlobalFilters(
    new ProblemDetailsExceptionFilter(errorReporter),
    new QueryFailedErrorFilter(errorReporter),  // narrower; registered LAST so it wins
  );
}
```

Reused by `main.ts` AND every e2e spec, so behavior never diverges between test and prod.

## QueryBuilder pattern

Repository methods use `createQueryBuilder` for anything beyond a single `findOne`. Two recurring patterns:

### Exclusion filters — LEFT JOIN + IS NULL

This is faster than `NOT IN` on big tables because Postgres can use the FK index.

```ts
// "students not enrolled in class :classId"
qb.leftJoin(
  'class_enrollments',
  'ce',
  'ce.user_id = user.id AND ce.class_id = :classId',
  { classId },
).andWhere('ce.class_id IS NULL');

// "students with no attendance for session :sessionId"
qb.leftJoin(
  'attendances',
  'att',
  'att.student_id = user.id AND att.session_id = :sessionId',
  { sessionId },
).andWhere('att.session_id IS NULL');
```

Validate the referenced ID exists first (`classesRepository.findOne(...)`); return 404 otherwise.

### Belt sort

Belts are stored as strings (`white`, `yellow`, …) so `ORDER BY belt` is alphabetical, not progression. Sort by a CASE expression:

```ts
qb.addSelect(`CASE
  WHEN user.belt = 'white' THEN 1
  WHEN user.belt = 'yellow' THEN 2
  WHEN user.belt = 'orange' THEN 3
  WHEN user.belt = 'green' THEN 4
  WHEN user.belt = 'blue' THEN 5
  WHEN user.belt = 'brown' THEN 6
  WHEN user.belt = 'black' THEN 7
  ELSE 8
END`, 'belt_order')
  .orderBy('belt_order', sortOrder)
  .addOrderBy('user.name', 'ASC');
```

## Problem details error handling

### `ProblemDetailsExceptionFilter` — catches every `HttpException`

```ts
@Catch()
export class ProblemDetailsExceptionFilter implements ExceptionFilter {
  constructor(private reporter: ErrorReporter) {}

  catch(ex: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail = 'An unexpected error occurred.';
    let errors: { field: string; message: string }[] | undefined;

    if (ex instanceof HttpException) {
      status = ex.getStatus();
      const body = ex.getResponse();
      if (typeof body === 'object' && body !== null) {
        title = (body as any).error ?? ex.name;
        detail = Array.isArray((body as any).message)
          ? 'One or more fields failed validation.'
          : (body as any).message ?? detail;
        if (Array.isArray((body as any).message) && status === 422) {
          errors = parseValidationErrors((body as any).message);
        }
      }
    } else {
      // Non-HttpException ⇒ report to ErrorReporter for visibility.
      this.reporter.captureException(ex, { path: req.url });
    }

    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: `https://api.seirin.dev/problems/${slug(title)}`,
        title,
        status,
        detail,
        instance: req.url,
        ...(errors ? { errors } : {}),
      });
  }
}
```

### `QueryFailedErrorFilter` — DB constraint → problem+json

Stop sprinkling `try { … } catch (e) { if (e.code === '23505') … }` across services. Name every constraint in the migration (`uq_users_registry`, `fk_classes_teacher_id`, `chk_classes_duration`, `uq_attendances_session_student`, etc.) and let a single filter translate them.

```ts
@Catch(QueryFailedError)
export class QueryFailedErrorFilter implements ExceptionFilter {
  private readonly map: Record<string, { status: number; title: string; detail: string }> = {
    uq_users_registry: { status: 409, title: 'Registry already in use', detail: 'A user with this registry already exists.' },
    uq_attendances_session_student: { status: 409, title: 'Duplicate attendance', detail: 'This student already has an attendance record for this session.' },
    uq_class_sessions_class_date: { status: 409, title: 'Duplicate session', detail: 'A session already exists for this class on this date.' },
    chk_classes_duration: { status: 422, title: 'Invalid class duration', detail: 'durationMinutes must be between 30 and 300.' },
    // … one entry per constraint
  };

  catch(ex: QueryFailedError, host: ArgumentsHost) {
    const constraint = (ex.driverError as { constraint?: string }).constraint;
    const known = constraint ? this.map[constraint] : undefined;
    const status = known?.status ?? 500;
    // … emit problem+json (delegate to a shared helper)
  }
}
```

Update the map whenever a new named constraint is added in a migration. The constraint→error table is also documented in [06-database-and-migrations.md](06-database-and-migrations.md).

Services should only do find-before-insert when the DB can't express the rule (e.g. "class must not be soft-deleted before enrolling a student" — the constraint check would be against `deleted_at IS NULL` AND require a row to match, which is awkward).

## Logging (`nestjs-pino`)

```ts
// common/logger/pino.config.ts
export const pinoConfig: Params = {
  pinoHttp: {
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { singleLine: true } }
      : undefined,
    level: process.env.LOG_LEVEL ?? 'info',
    redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
    customProps: (req) => ({ requestId: req.id }),
    genReqId: (req, res) => {
      const incoming = req.headers['x-request-id'];
      const id = typeof incoming === 'string' && incoming.length < 100 ? incoming : randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
  },
};
```

Wire in `AppModule` via `LoggerModule.forRoot(pinoConfig)`. `main.ts`: `app.useLogger(app.get(Logger))`.

`ProblemDetailsExceptionFilter` should reuse the request-scoped logger to log unhandled exceptions with the request ID.

## Error reporter (placeholder for future Sentry)

```ts
// common/error-reporter/error-reporter.ts
export interface ErrorReporter {
  captureException(err: unknown, context?: Record<string, unknown>): void;
}

@Injectable()
export class NoopErrorReporter implements ErrorReporter {
  captureException(): void { /* no-op */ }
}
```

Provider binding in `app.module.ts`:

```ts
{ provide: 'ErrorReporter', useClass: NoopErrorReporter }
```

When the team is ready for Sentry (or alternative), implement `SentryErrorReporter`, change the `useClass`, and add the SDK init in `main.ts`. **No call sites change.**

## Configuration

Single config factory `config/configuration.ts` + Joi validation. Read via `ConfigService.get('namespace.key')`:

```ts
// configuration.ts
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),
  RUN_MIGRATIONS: Joi.boolean().default(true),

  DB_TYPE: Joi.string().valid('postgres').required(),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: Joi.number().default(30),
  BCRYPT_SALT_ROUNDS: Joi.number().default(10),

  SWAGGER_ENABLED: Joi.boolean().default(true),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'trace').default('info'),
});

export default () => ({
  app: { nodeEnv: process.env.NODE_ENV, port: +process.env.PORT!, runMigrations: process.env.RUN_MIGRATIONS === 'true' },
  database: { type: process.env.DB_TYPE, host: process.env.DB_HOST, port: +process.env.DB_PORT!, user: process.env.DB_USER, password: process.env.DB_PASSWORD, name: process.env.DB_NAME },
  jwt: { secret: process.env.JWT_SECRET, accessTtl: process.env.JWT_ACCESS_TTL, refreshTtlDays: +process.env.JWT_REFRESH_TTL_DAYS! },
  security: { bcryptSaltRounds: +process.env.BCRYPT_SALT_ROUNDS! },
  features: { swaggerEnabled: process.env.SWAGGER_ENABLED === 'true' },
  logging: { level: process.env.LOG_LEVEL },
});
```

> **Don't** add fallbacks for required secrets. If `JWT_SECRET` is missing, the app must refuse to start.

## Shared utilities

### `EntityUtil` (`src/common/utils/entity.util.ts`)

Reused as-is from v1:

- `updateFields(target, source, excludeFields?)` — copy defined fields from `source` onto `target`, skipping excluded keys.
- `ensureNotInArray(array, itemId, errorMsg)` — throw `BadRequestException` if `array.some(x => x.id === itemId)`.
- `removeFromArray(array, itemId, errorMsg)` — splice or throw.

`toggleActive` is removed — soft-delete is via TypeORM `softRemove` / `restore`.

### `PasswordService` (`src/common/utils/password.service.ts`)

```ts
@Injectable()
export class PasswordService {
  constructor(private config: ConfigService) {}
  hashPassword(p: string) { return bcrypt.hash(p, this.config.getOrThrow<number>('security.bcryptSaltRounds')); }
  compare(p: string, hash: string) { return bcrypt.compare(p, hash); }
}
```

## Commit conventions

`@commitlint/config-conventional`. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `revert`. Scope optional but recommended (`feat(students): …`). Husky `commit-msg` hook + `pre-commit` running lint-staged.

## Don't

- Don't add an `isActive` boolean. Use `@DeleteDateColumn` everywhere.
- Don't `try/catch` Postgres error codes in services. Name constraints and let `QueryFailedErrorFilter` translate.
- Don't put a JWT secret fallback anywhere. `ConfigService.getOrThrow('jwt.secret')` only.
- Don't import `console.log` for "real" logging. Use the injected `Logger` from `nestjs-pino`.
- Don't create a service-to-service dependency that crosses two feature boundaries — push the shared bit into `common/`.
- Don't expose entity instances raw if they hold `password` or `deletedAt` — the global `ClassSerializerInterceptor` handles `@Exclude()`, but verify in the e2e suite.
