# 09 — Bootstrap Checklist

Execute these tasks **in order** in the new (empty) repository. Don't skip ahead — later steps depend on earlier ones.

## Phase 0 — Repository scaffold

- [ ] `npx @nestjs/cli new seirin-v2 --package-manager npm --skip-git false`
- [ ] Inside the new repo, install runtime deps:
  ```
  npm i @nestjs/config @nestjs/jwt @nestjs/passport @nestjs/swagger @nestjs/throttler @nestjs/typeorm \
        bcrypt class-transformer class-validator helmet joi nestjs-pino pino pino-http \
        passport passport-jwt passport-local pg reflect-metadata rxjs typeorm
  ```
- [ ] Install dev deps:
  ```
  npm i -D @commitlint/cli @commitlint/config-conventional @nestjs/testing \
        @suites/di.nestjs @suites/doubles.jest @suites/unit @types/bcrypt @types/jest \
        @types/node @types/passport-jwt @types/passport-local @types/supertest \
        eslint eslint-config-prettier eslint-plugin-prettier globals husky jest \
        lint-staged pino-pretty prettier supertest ts-jest ts-loader ts-node \
        tsconfig-paths typescript typescript-eslint
  ```
- [ ] Copy `docs-recreation/claude-md-templates/root-CLAUDE.md` → `CLAUDE.md`.
- [ ] Copy each `docs-recreation/claude-md-templates/src-<module>-CLAUDE.md` → `src/<module>/CLAUDE.md` after the module exists (later steps).
- [ ] Set up Husky: `npx husky init && echo "npx lint-staged" > .husky/pre-commit && echo "npx --no -- commitlint --edit \$1" > .husky/commit-msg`.
- [ ] Configure `lint-staged` in `package.json` and `commitlint.config.js` (`extends: ['@commitlint/config-conventional']`).
- [ ] Configure `eslint.config.mjs` (flat config, TS + Prettier integration).
- [ ] Write `.env.example` and `.env.test` from the env-var list in [05-architecture-and-conventions.md](05-architecture-and-conventions.md#configuration).

## Phase 1 — Infrastructure

- [ ] Write `compose.yaml` with two services: `postgres` (port 5432) and `postgres-test` (port 5433, db `seirin_test`).
- [ ] Write multi-stage `Dockerfile` (`builder` installs deps + builds; `runtime` copies dist + `node_modules` and runs `node dist/main`).
- [ ] Write `db/datasource.ts` per [06-database-and-migrations.md](06-database-and-migrations.md#datasource-dbdatasourcets).
- [ ] Write `config/configuration.ts` (factory + Joi schema).
- [ ] Add the migration scripts to `package.json`.

## Phase 2 — Common module

Implement before any feature module — everything else imports from here.

- [ ] `src/common/enums.ts` — the four enums from [02-domain-model.md](02-domain-model.md#enums-srccommonenumsts).
- [ ] `src/common/interfaces/` — `RequestWithUser`, `PaginatedResponse<T>`, `JwtPayload`.
- [ ] `src/common/decorators.ts` — `@Public`, `@Roles`, `@CurrentUser`.
- [ ] `src/common/dto/include-deleted.dto.ts`.
- [ ] `src/common/utils/password.service.ts` — bcrypt wrapper.
- [ ] `src/common/utils/entity.util.ts` — `updateFields`, `ensureNotInArray`, `removeFromArray` (drop `toggleActive`).
- [ ] `src/common/error-reporter/{error-reporter.interface.ts,noop-error-reporter.ts}`.
- [ ] `src/common/filters/problem-details-exception.filter.ts`.
- [ ] `src/common/filters/query-failed-error.filter.ts` — empty constraint map for now; populate as migrations land.
- [ ] `src/common/logger/pino.config.ts`.
- [ ] `src/common/setup-app.ts` — global pipes + interceptors + filters.
- [ ] Copy `claude-md-templates/src-common-CLAUDE.md` → `src/common/CLAUDE.md`.

## Phase 3 — Users + Auth

- [ ] Generate migration `1-CreateUsersAndRoles` per [06](06-database-and-migrations.md#1-createusersandroles). Apply it.
- [ ] `src/users/entities/{user,user-role}.entity.ts` per [02-domain-model.md](02-domain-model.md).
- [ ] `src/users/dto/query-users.dto.ts` per [03-api.md](03-api.md#querystudentsdto).
- [ ] `src/users/users.service.ts` with `create`, `findById`, `findByRegistry`, `findByRole` (LEFT JOIN exclusion-filter pattern), `update`, `getTeacher`, `getStudent`.
- [ ] `src/users/users.module.ts`. Export `UsersService` + `PasswordService`.
- [ ] Generate migration `2-CreateRefreshTokens` (jump ahead because we need it now).
- [ ] `src/auth/entities/refresh-token.entity.ts`.
- [ ] `src/auth/auth.service.ts` — `validateCredentials`, `login`, `refresh`, `logout`. See [04-auth-and-rbac.md](04-auth-and-rbac.md).
- [ ] `src/auth/strategies/jwt.strategy.ts` — `getOrThrow('jwt.secret')`, no fallback.
- [ ] `src/auth/strategies/local.strategy.ts`.
- [ ] `src/auth/guards/{jwt-auth,local-auth,roles}.guard.ts`.
- [ ] `src/auth/auth.controller.ts` — `/auth/login`, `/refresh`, `/logout`, `/me`.
- [ ] `src/auth/auth.module.ts`.
- [ ] Copy `claude-md-templates/src-auth-CLAUDE.md`, `src-users-CLAUDE.md` into place.
- [ ] Update `QueryFailedErrorFilter` constraint map with `uq_users_registry`, `uq_user_roles_user_role`.

## Phase 4 — Teachers profile

- [ ] `src/teachers/teachers.service.ts` (light wrapper around `UsersService.getTeacher`).
- [ ] Either expose `/teachers/me` or fold into `/auth/me` — recommend the latter for v2.
- [ ] Copy `src-teachers-CLAUDE.md` (likely tiny).

## Phase 5 — Students

- [ ] `src/students/dto/{create-student,update-student,query-students}.dto.ts`.
- [ ] `src/students/students.service.ts` — delegates to `UsersService.findByRole(STUDENT, …, instructorId)`.
- [ ] `src/students/students.controller.ts` — `@Roles(TEACHER)`, all routes scoped to `@CurrentUser().id`.
- [ ] `src/students/students.module.ts`.
- [ ] Copy `src-students-CLAUDE.md`.
- [ ] Write `students.e2e-spec.ts` covering CRUD + every filter.

## Phase 6 — Classes + enrollments

- [ ] Generate migration `3-CreateClassesAndEnrollments`. Apply.
- [ ] `src/classes/entities/class.entity.ts`.
- [ ] `src/classes/dto/{create-class,update-class,find-all-classes}.dto.ts`.
- [ ] `src/classes/classes.service.ts` — CRUD + soft-delete + restore + enroll/unenroll.
- [ ] `src/classes/classes.controller.ts`.
- [ ] `src/classes/classes.module.ts`.
- [ ] Update `QueryFailedErrorFilter` map (`chk_classes_duration`, FKs).
- [ ] Copy `src-classes-CLAUDE.md`.
- [ ] Write `classes.e2e-spec.ts`.

## Phase 7 — Class sessions

- [ ] Generate migration `4-CreateClassSessions`. Apply.
- [ ] `src/class-sessions/entities/class-session.entity.ts`.
- [ ] `src/class-sessions/dto/{create,update,find-all,find-by-date-range}-class-session.dto.ts`.
- [ ] `src/class-sessions/class-sessions.service.ts` — CRUD + soft-delete + `start`/`end` + `findByDateRange`.
- [ ] `src/class-sessions/class-sessions.controller.ts`.
- [ ] `src/class-sessions/class-sessions.module.ts`.
- [ ] Update `QueryFailedErrorFilter` map (`uq_class_sessions_class_date`).
- [ ] Copy `src-class-sessions-CLAUDE.md`.
- [ ] Write `class-sessions.e2e-spec.ts`.

## Phase 8 — Attendances

- [ ] Generate migration `5-CreateAttendances`. Apply.
- [ ] `src/attendances/entities/attendance.entity.ts`.
- [ ] `src/attendances/dto/{create,update,query}-attendance.dto.ts`.
- [ ] `src/attendances/attendances.service.ts` — single create, bulk create (transactional, idempotent), filters, `mark-*` shortcuts.
- [ ] `src/attendances/attendances.controller.ts`.
- [ ] `src/attendances/attendances.module.ts`.
- [ ] Update `QueryFailedErrorFilter` map.
- [ ] Copy `src-attendances-CLAUDE.md`.
- [ ] Write `attendances.e2e-spec.ts`.

## Phase 9 — Health + main wiring

- [ ] Install `@nestjs/terminus`. Add `src/health/health.controller.ts` using `TypeOrmHealthIndicator`.
- [ ] Wire up `AppModule` with all feature modules, `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])`, `LoggerModule.forRoot(pinoConfig)`, the `ErrorReporter` provider, and global `APP_GUARD`s (Jwt → Roles → Throttler).
- [ ] `main.ts`:
  - `NestFactory.create(AppModule, { bufferLogs: true })`
  - `app.useLogger(app.get(Logger))`
  - `setupApp(app, app.get('ErrorReporter'))`
  - `app.use(helmet()); app.enableCors();`
  - Run migrations if `RUN_MIGRATIONS=true`.
  - Configure Swagger at `/api`.
  - `await app.listen(config.get('app.port'))`.

## Phase 10 — Seeds + smoke tests

- [ ] `db/seeds/run-seed.ts` + per-entity seeders.
- [ ] `npm run seed:dev` populates the dev DB.
- [ ] Smoke-test by hand: login as `PROF001`, list students, create a session, mark attendance.
- [ ] Visit `http://localhost:3000/api` and confirm every endpoint group is documented.

## Phase 11 — E2E suites & coverage

- [ ] `test/jest-e2e.json` with `testRegex: '.*\\.e2e-spec\\.ts$'` and `--runInBand` enforced by the script.
- [ ] `test/support/{login,problem-details,seed}.ts` helpers.
- [ ] Write the seven required e2e suites listed in [07-testing.md](07-testing.md#required-e2e-suites-for-v1-write-before-shipping).
- [ ] Add Jest `coverageThreshold` and ensure `npm run test:cov:all` passes.

## Phase 12 — CI

- [ ] `.github/workflows/ci.yml` jobs: `lint`, `build`, `test`, `e2e` (uses `services: postgres`), `coverage-upload`.
- [ ] Block merges on red CI.
- [ ] Optional: `.github/workflows/release.yml` builds + publishes Docker image to GHCR on `main` and tags.

## Final verification

Run through every checklist in [00-README.md](00-README.md):

- [ ] Every endpoint in [03-api.md](03-api.md) is reachable from Swagger UI.
- [ ] Every entity field in [02-domain-model.md](02-domain-model.md) exists in the entity files AND the database (run `migration:show` and inspect via `psql`).
- [ ] Every CLAUDE.md template lives in its target directory.
- [ ] `npm run lint` clean, `npm test` clean, `npm run test:e2e` clean.
- [ ] Teacher-isolation e2e is green — there is no way to read across teachers.
