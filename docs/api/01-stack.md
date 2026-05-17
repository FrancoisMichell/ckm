# 01 — Stack

Pinned versions for the new repository. Use the latest patch within the listed minor at bootstrap time.

## Runtime

| Tool       | Version          | Notes                                                                  |
| ---------- | ---------------- | ---------------------------------------------------------------------- |
| Node.js    | **22 LTS**       | Bump from 20. Native fetch, stable test runner — but we still use Jest. |
| TypeScript | **5.9.x**        | Keep.                                                                  |
| PostgreSQL | **16**           | Bump from 15. No code changes required.                                |

## Framework + ORM

| Package                     | Version       | Decision                                                              |
| --------------------------- | ------------- | --------------------------------------------------------------------- |
| `@nestjs/*` (core, common, platform-express, config, jwt, passport, swagger, throttler, typeorm) | **^11.1.x** | Keep latest 11.x.                       |
| `typeorm`                   | **^0.3.x**    | Keep. Prisma/Drizzle rejected: the LEFT JOIN + IS NULL exclusion-filter pattern in `users.service.ts` translates cleanly and the existing migration workflow is already proven. |
| `pg`                        | **^8.x**      | Postgres driver.                                                      |
| `class-validator`           | **^0.14.x**   | Keep.                                                                 |
| `class-transformer`         | **^0.5.x**    | Keep.                                                                 |
| `joi`                       | **^18.x**     | Env-var validation schema. Keep.                                      |

## Auth + security

| Package              | Version    | Notes                                                                |
| -------------------- | ---------- | -------------------------------------------------------------------- |
| `passport`           | **^0.7.x** | Keep.                                                                |
| `passport-jwt`       | **^4.0.x** | Access-token strategy.                                               |
| `passport-local`     | **^1.0.x** | Login strategy. Keep.                                                |
| `bcrypt`             | **^6.x**   | Password hashing. Salt rounds from `BCRYPT_SALT_ROUNDS` env.         |
| `helmet`             | **^8.x**   | Default security headers.                                            |
| `@nestjs/throttler`  | **^6.x**   | Global 100/60s, `/auth/login` 5/60s.                                 |

## Logging + error reporting

| Package         | Version   | Notes                                                                       |
| --------------- | --------- | --------------------------------------------------------------------------- |
| `nestjs-pino`   | **^4.x**  | **NEW**. Replaces default Nest logger. JSON output with request IDs.        |
| `pino`          | **^9.x**  | Underlying logger.                                                          |
| `pino-http`     | **^10.x** | Request logging middleware.                                                 |
| `pino-pretty`   | **^13.x** | Dev-only pretty printer (devDependency).                                    |

**Error reporting**: NOT installed yet. Implement an `ErrorReporter` interface in `common/` with a default `NoopErrorReporter`. A Sentry adapter (or alternative) can drop in later by changing one provider binding. See [05-architecture-and-conventions.md](05-architecture-and-conventions.md) and [08-improvements-rationale.md](08-improvements-rationale.md).

## API docs

| Package                | Version    | Notes                                                          |
| ---------------------- | ---------- | -------------------------------------------------------------- |
| `@nestjs/swagger`      | **^11.x**  | Swagger UI at `GET /api`.                                      |
| `swagger-ui-express`   | **^5.x**   | Required by `@nestjs/swagger`.                                 |

## Testing

| Package                                          | Version    | Notes                                                                  |
| ------------------------------------------------ | ---------- | ---------------------------------------------------------------------- |
| `jest`                                           | **^30.x**  | Keep. Vitest rejected: `@suites/*` integrations target Jest and the e2e suite is already established. |
| `ts-jest`                                        | **^29.x**  |                                                                        |
| `supertest`                                      | **^7.x**   | E2E HTTP assertions.                                                   |
| `@nestjs/testing`                                | **^11.x**  |                                                                        |
| `@suites/unit`, `@suites/di.nestjs`, `@suites/doubles.jest` | **^3.x** | TestBed + jest doubles for unit specs.                       |

## Dev tooling

| Package         | Version    | Notes                                                |
| --------------- | ---------- | ---------------------------------------------------- |
| `eslint`        | **^9.x**   | Flat config (`eslint.config.mjs`).                   |
| `typescript-eslint` | **^8.x** |                                                      |
| `prettier`      | **^3.x**   |                                                      |
| `husky`         | **^9.x**   | Pre-commit hook.                                     |
| `lint-staged`   | **^16.x**  | Run eslint+prettier on staged files.                 |
| `@commitlint/cli`, `@commitlint/config-conventional` | **^20.x** | Conventional commits enforced. |

## Container / dev infra

| Tool                | Notes                                                                   |
| ------------------- | ----------------------------------------------------------------------- |
| Docker Compose      | Two services: `postgres` (dev/prod), `postgres-test` (e2e isolation).   |
| Multi-stage Dockerfile | `builder` → `runtime`. Run `node dist/main` in production.            |

## Removed vs. v1

- **`@sentry/node`** — not installed. Replaced by swappable `ErrorReporter`.
- **`js-yaml`** — only used for an unused config feature; remove unless it earns its place.
- **Hardcoded `'your_jwt_secret_key'` fallback** in `jwt.strategy.ts` — gone. `JWT_SECRET` is required by Joi schema; no fallback.
