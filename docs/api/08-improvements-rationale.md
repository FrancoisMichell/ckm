# 08 — Improvements Rationale

What v2 changes vs. the v1 prototype, why, and how to land each change.

## 1. Soft delete + audit fields

**What**: Replace `isActive: boolean` on User, Class, ClassSession, Attendance with TypeORM `@DeleteDateColumn deletedAt: Date | null`. Add `created_by` / `updated_by` UUID columns to Class, ClassSession, Attendance (NOT to User or UserRole — circular, and the user-creating-user case is identity-bound).

**Why**:
- `isActive` cannot answer *when* something was deactivated or *who* did it. `deletedAt` gives a timestamp for free.
- TypeORM's `softRemove` / `restore` are first-class and integrate with `find` (auto-filters non-deleted rows unless `withDeleted: true` is passed).
- Audit fields are required by basically any future compliance work (LGPD, ISO 27001).

**How**:
- Entity columns: `@DeleteDateColumn({ name: 'deleted_at' }) deletedAt?: Date | null` plus `@Column('uuid') createdBy: string;` / `updatedBy: string`.
- Service layer: set `updatedBy` on every save (extract from `CurrentUser`). A NestJS interceptor (`AuditInterceptor`) can do this generically by inspecting `request.user.id` and `request.body`.
- All `find*` calls use TypeORM's default (excludes deleted). The `?includeDeleted=true` query param flips it on (`withDeleted: true`).
- Migrations: `deleted_at TIMESTAMPTZ NULL` + partial unique indexes (see [06](06-database-and-migrations.md)).

**Migration considerations**: not migrating from v1 — fresh DB. No backfill needed.

## 2. Refresh tokens + 15-minute access TTL

**What**: Replace v1's single 60-minute JWT with a 15-minute access token + 30-day refresh token (one-time use, family-revoke on reuse).

**Why**:
- 60 minutes is too long for a stolen token; 15 minutes caps the blast radius without making users sign in constantly.
- Refresh rotation with family revocation is the only practical defense against refresh-token theft.
- Decouples session lifetime from access token lifetime — logout actually means something.

**How**:
- New `refresh_tokens` table (see [02](02-domain-model.md#refreshtoken-refresh_tokens-table--new-for-v2)).
- `POST /auth/login` returns both; `POST /auth/refresh` rotates; `POST /auth/logout` revokes the supplied refresh.
- Token generation: `crypto.randomBytes(48).toString('base64url')`. Store only `bcrypt(token)`.
- See [04-auth-and-rbac.md](04-auth-and-rbac.md#refresh-flow-post-authrefresh) for the rotation algorithm.

**Migration considerations**: existing clients (Bruno requests, future frontend) need updating to:
1. Store both tokens.
2. Call `/auth/refresh` on 401.
3. Replace stored tokens with the response of `/auth/refresh`.

## 3. RFC 7807 problem+json error contract

**What**: Every non-2xx response uses `application/problem+json` with `{ type, title, status, detail, instance, errors? }`.

**Why**:
- v1 returned ad-hoc shapes: sometimes `{ message: string }`, sometimes `{ message: string[] }` (validation), sometimes raw `BadRequestException` JSON.
- A typed contract lets a frontend write one error handler.
- RFC 7807 is an actual standard — better than inventing a custom shape.

**How**:
- `ProblemDetailsExceptionFilter` catches everything and emits problem+json. See [05](05-architecture-and-conventions.md#problemdetailsexceptionfilter--catches-every-httpexception).
- `QueryFailedErrorFilter` catches `TypeORM.QueryFailedError` and maps named DB constraints to specific titles/statuses. This **replaces** the v1 pattern of `try { … } catch (e) { if (e.code === '23505') … }` scattered across services.
- `ValidationPipe` is configured with `errorHttpStatusCode: 422` (instead of the default 400) so validation failures get a distinct status.

**Migration considerations**: API consumers must accept both `application/json` (success) and `application/problem+json` (error). Most HTTP clients don't care.

## 4. Pino structured logging + request IDs (+ swappable error reporter)

**What**: Default Nest logger → `nestjs-pino`. Every request gets a UUID; every log line carries it. An `ErrorReporter` interface wraps "report this to a third-party service" so we can drop in Sentry (or alternative) later without touching call sites.

**Why**:
- Production debugging without structured logs is misery. Pino is the fastest practical option and integrates cleanly with Nest.
- Request IDs let us correlate "user X reported a failure at 14:32" to specific log lines in seconds.
- Sentry is great but we don't need it on day one and we don't want to pre-commit to a vendor. The interface is cheap insurance.

**How**:
- Install `nestjs-pino`, `pino`, `pino-http`. Dev dep: `pino-pretty`.
- Wire `LoggerModule.forRoot(pinoConfig)` in `AppModule`. See [05](05-architecture-and-conventions.md#logging-nestjs-pino) for the config.
- `main.ts`: `app.useLogger(app.get(Logger))`.
- `ErrorReporter` interface + `NoopErrorReporter` implementation (default).
- Filters call `errorReporter.captureException(err, ctx)` for unhandled errors.

**Migration considerations**: log lines change format. Any external log aggregator parsing the old format must be updated. There's no migration risk because the system isn't in production.

## Deferred (NOT in v1)

Listed here so future agents don't accidentally implement them now, and so the plug-points are obvious when the time comes.

| Capability                              | Plug-point                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| Sentry / Datadog error reporting        | Implement `SentryErrorReporter implements ErrorReporter`, switch the provider binding in `app.module.ts`. Add SDK init in `main.ts` gated on `SENTRY_DSN`. No call-site changes. |
| Redis cache (student list, class roster) | Wrap the relevant service methods with `@CacheKey`/`@CacheTTL`. Bust on writes via `cacheManager.del`. |
| Belt history / graduations              | New `belt_history` table with `(user_id, belt, awarded_at, awarded_by)`; backfill from `users.belt` snapshot.                                                              |
| Payments / invoicing                    | Whole new module + table; payment-provider adapter sits in `common/`.                |
| Notifications (email / SMS)             | `NotificationService` interface + adapter pattern. Triggered from domain events (start with a `DomainEventsService` that controllers fire into). |
| Dashboards / analytics                  | Read-only queries — likely a `reports/` module with denormalized views. Hold off until use cases are clearer. |
| Student self-service                    | Re-use existing `STUDENT` role + a new controller set with student-scoped guards.    |

## Things removed vs. v1

- `isActive` boolean on every entity.
- `PATCH /classes/:id/activate` and `/deactivate` (→ `DELETE` + `POST /restore`).
- `PATCH /class-sessions/:id/activate` and `/deactivate` (same).
- Hardcoded `'your_jwt_secret_key'` fallback in `jwt.strategy.ts`.
- `try/catch (err.code === '23505')` in services.
- `console.log` in `users.service.ts:applySorting` (debug leftover).
- `js-yaml` dependency (unused).
- `EntityUtil.toggleActive` helper (no longer needed; `softRemove`/`restore` do it).
