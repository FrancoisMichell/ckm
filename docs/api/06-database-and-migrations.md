# 06 — Database & Migrations

## DataSource (`db/datasource.ts`)

```ts
import { config } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as path from 'path';

const isTest = process.env.NODE_ENV === 'test';
config({
  path: path.resolve(__dirname, isTest ? '../.env.test' : '../.env'),
  override: true,
});

export const datasourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST!,
  port: +process.env.DB_PORT!,
  username: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
  entities: isTest ? ['src/**/*.entity.ts'] : ['dist/**/*.entity.js'],
  migrations: isTest ? ['db/migrations/*.ts'] : ['dist/db/migrations/*.js'],
  migrationsTableName: 'migrations',
  migrationsRun: false,
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
  extra: { max: 10 },
};

export default new DataSource(datasourceOptions);
```

Imported in `AppModule` via `TypeOrmModule.forRoot(datasourceOptions)`. Run on startup is gated by `RUN_MIGRATIONS` env (defaults true) — `main.ts` calls `dataSource.runMigrations()` if enabled.

## Migration commands

```jsonc
// package.json scripts
{
  "typeorm": "typeorm-ts-node-commonjs -d db/datasource.ts",
  "migration:generate": "npm run build && npm run typeorm -- migration:generate",
  "migration:run":      "npm run build && npm run typeorm -- migration:run",
  "migration:revert":   "npm run build && npm run typeorm -- migration:revert",
  "migration:show":     "npm run build && npm run typeorm -- migration:show"
}
```

Generate: `npm run migration:generate -- db/migrations/AddBeltHistory`.

## Migration plan (v1 bootstrap)

Create migrations in this order. Each one names its constraints explicitly so the `QueryFailedErrorFilter` map stays in sync.

### 1. `CreateUsersAndRoles`

- Create enum types `belt_enum`, `user_role_type_enum`.
- Create `users` table with all columns from [02-domain-model.md](02-domain-model.md#user-users-table).
  - Constraints: `uq_users_registry` UNIQUE(`registry`).
  - Indexes: `idx_users_deleted_at`, `idx_users_deleted_name`, `idx_users_instructor_id`.
- Create `user_roles` table.
  - FK `fk_user_roles_user_id` → `users(id)` ON DELETE CASCADE.
  - Constraint `uq_user_roles_user_role` UNIQUE(`user_id`, `role`).

### 2. `CreateClassesAndEnrollments`

- Create enum `day_of_week_enum` (stored as text 0-6).
- Create `classes` table.
  - FK `fk_classes_teacher_id` → `users(id)` ON DELETE RESTRICT.
  - FK `fk_classes_created_by`, `fk_classes_updated_by` → `users(id)` ON DELETE RESTRICT.
  - Constraint `chk_classes_duration` CHECK (`duration_minutes BETWEEN 30 AND 300`).
  - Indexes: `idx_classes_teacher_id`, `idx_classes_deleted_at`.
- Create `class_enrollments` table.
  - Composite PK (`class_id`, `user_id`).
  - FK `fk_class_enrollments_class_id` → `classes(id)` ON DELETE CASCADE.
  - FK `fk_class_enrollments_user_id` → `users(id)` ON DELETE RESTRICT.

### 3. `CreateClassSessions`

- Create `class_sessions` table.
  - FK `fk_class_sessions_class_id` → `classes(id)` RESTRICT.
  - FK `fk_class_sessions_teacher_id` → `users(id)` RESTRICT.
  - FK `fk_class_sessions_created_by`, `fk_class_sessions_updated_by` → `users(id)` RESTRICT.
  - Partial unique: `CREATE UNIQUE INDEX uq_class_sessions_class_date ON class_sessions(class_id, date) WHERE deleted_at IS NULL;`
  - Indexes: `idx_class_sessions_date_class`, `idx_class_sessions_deleted_at`.

### 4. `CreateAttendances`

- Create enum `attendance_status_enum`.
- Create `attendances` table.
  - FK `fk_attendances_session_id` → `class_sessions(id)` ON DELETE CASCADE.
  - FK `fk_attendances_student_id` → `users(id)` ON DELETE RESTRICT.
  - FK audit columns.
  - Partial unique: `CREATE UNIQUE INDEX uq_attendances_session_student ON attendances(session_id, student_id) WHERE deleted_at IS NULL;`
  - Indexes: `idx_attendances_session_id`, `idx_attendances_student_id`.

### 5. `CreateRefreshTokens`

- Create `refresh_tokens` table.
  - FK `fk_refresh_tokens_user_id` → `users(id)` ON DELETE CASCADE.
  - FK `fk_refresh_tokens_replaced_by` → `refresh_tokens(id)` ON DELETE SET NULL.
  - Indexes: `idx_refresh_tokens_user_id`, `idx_refresh_tokens_family_id`, `idx_refresh_tokens_expires_at`.

## Constraint → error map

The single source of truth for `QueryFailedErrorFilter` (see [05](05-architecture-and-conventions.md#queryfailederrorfilter--db-constraint--problemjson)). When you add a new named constraint in a migration, add a row here AND in the filter map in the same commit.

| Constraint                          | HTTP | Title                    | User-facing detail                                                  |
| ----------------------------------- | ---- | ------------------------ | ------------------------------------------------------------------- |
| `uq_users_registry`                 | 409  | Registry already in use  | A user with this registry already exists.                           |
| `uq_user_roles_user_role`           | 409  | Duplicate role           | This user already has the requested role.                           |
| `uq_class_sessions_class_date`      | 409  | Duplicate session        | A session already exists for this class on this date.               |
| `uq_attendances_session_student`    | 409  | Duplicate attendance     | This student already has an attendance for this session.            |
| `chk_classes_duration`              | 422  | Invalid class duration   | durationMinutes must be between 30 and 300.                         |
| `fk_classes_teacher_id`             | 422  | Invalid teacher          | The referenced teacher does not exist.                              |
| `fk_class_sessions_class_id`        | 422  | Invalid class            | The referenced class does not exist.                                |
| `fk_class_sessions_teacher_id`      | 422  | Invalid teacher          | The referenced teacher does not exist.                              |
| `fk_attendances_session_id`         | 422  | Invalid session          | The referenced session does not exist.                              |
| `fk_attendances_student_id`         | 422  | Invalid student          | The referenced student does not exist.                              |
| `fk_class_enrollments_user_id`      | 422  | Invalid student          | The referenced student does not exist.                              |

Any constraint NOT in this map falls through to a generic 500. That's acceptable as long as you log the constraint name and add it to the map.

## Seeds (`db/seeds/`)

`npm run seed:dev` populates a deterministic dataset for manual API testing. `npm run seed:test` seeds a fresh test DB inside e2e suites.

**Fixtures** (use stable UUIDs so request collections can hard-code them):

- 1 teacher: registry `PROF001`, password `password123` (already bcrypt-hashed), all classes/sessions owned by them.
- 11 students: 8 active, 3 soft-deleted. Mixed belts WHITE → BLACK. Some enrolled in multiple classes, one enrolled in zero (for the `notEnrolledInClass` filter test).
- 5 classes: varied `days` arrays and durations.
- 9 class sessions: 7 in the past (some with attendance recorded), 2 in the future.
- 15+ attendance records: mix of `PENDING`, `PRESENT`, `LATE`, `ABSENT`, `EXCUSED`. One enrolled-class=false (guest).

Seed file structure:

```
db/seeds/
├── run-seed.ts                 # entrypoint, reads NODE_ENV
├── data/
│   ├── users.data.ts
│   ├── classes.data.ts
│   ├── sessions.data.ts
│   └── attendances.data.ts
└── seeders/
    ├── users.seeder.ts
    ├── classes.seeder.ts
    └── ...
```

Each seeder is idempotent (insert-or-skip on PK). `run-seed.ts` refuses to run in production:

```ts
if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed production database.');
}
```

## E2E test isolation

`postgres-test` runs on a different port and DB name (`seirin_test`) via `compose.yaml`. Before each suite:

```ts
beforeAll(async () => {
  if (!process.env.DB_NAME?.endsWith('_test')) {
    throw new Error('Refusing to wipe non-test DB.');
  }
  await dataSource.dropDatabase();
  await dataSource.runMigrations();
  await seed();
});
```

The DB-name guard is non-negotiable. Add it to every e2e setup file.

## Connection pool

`extra: { max: 10 }` is fine for local dev. Production should override via env if needed.

## Don't

- Don't edit a migration after it's been committed and run anywhere. Write a new migration.
- Don't `synchronize: true`. Ever.
- Don't add columns directly to `entities/*.entity.ts` without generating a migration in the same commit. CI should fail if `migration:generate` would produce a diff against `main`.
