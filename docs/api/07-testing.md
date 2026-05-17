# 07 — Testing

## Test types & layout

| Type   | Location                | Runner                                | Speed | DB                         |
| ------ | ----------------------- | ------------------------------------- | ----- | -------------------------- |
| Unit   | `src/**/*.spec.ts`      | `jest` (uses repo-level config)       | fast  | mocked via `@suites/doubles.jest` |
| E2E    | `test/**/*.e2e-spec.ts` | `jest --config ./test/jest-e2e.json`  | slow  | real `postgres-test` container   |

## Jest config (repo root)

```jsonc
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "src",
  "testRegex": ".*\\.spec\\.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "moduleNameMapper": { "^src/(.*)$": "<rootDir>/$1" },
  "collectCoverageFrom": ["**/*.(t|j)s"],
  "coverageDirectory": "../coverage",
  "testEnvironment": "node",
  "coverageReporters": ["text", "lcov", "html", "text-summary"],
  "coveragePathIgnorePatterns": [
    "/node_modules/", "/dist/",
    ".*\\.module\\.ts", ".*\\.entity\\.ts", ".*\\.dto\\.ts",
    "setup-app\\.ts", "main\\.ts"
  ]
}
```

E2E uses `test/jest-e2e.json` with `rootDir: '.'`, `testRegex: '.*\\.e2e-spec\\.ts$'`, and `globalSetup` / `globalTeardown` for the test-DB lifecycle.

## Coverage gates

CI fails if any of these drop below threshold (configured via Jest `coverageThreshold`):

```jsonc
"coverageThreshold": {
  "global": { "branches": 75, "functions": 80, "lines": 80, "statements": 80 }
}
```

## Unit tests — `@suites/unit` pattern

```ts
import { TestBed } from '@suites/unit';
import { Mocked } from '@suites/doubles.jest';

describe('StudentsService', () => {
  let service: StudentsService;
  let users: Mocked<UsersService>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(StudentsService).compile();
    service = unit;
    users = unitRef.get(UsersService);
  });

  it('creates a student scoped to the current teacher', async () => {
    users.create.mockResolvedValue({ id: 's1' } as any);
    const result = await service.create({ name: 'A', belt: Belt.WHITE }, 't1');
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'A', instructor: expect.objectContaining({ id: 't1' }) }),
      [UserRoleType.STUDENT],
    );
    expect(result).toEqual({ id: 's1' });
  });
});
```

Notes:
- `TestBed.solitary` mocks every injected dependency. Use `TestBed.sociable` only when explicitly testing a small group together.
- Don't mock TypeORM Repository methods that the system-under-test doesn't directly invoke.

## E2E tests — supertest pattern

```ts
let app: INestApplication;
let dataSource: DataSource;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  setupApp(app, new NoopErrorReporter());
  await app.init();
  dataSource = moduleRef.get(DataSource);

  if (!process.env.DB_NAME?.endsWith('_test')) throw new Error('Refusing to wipe non-test DB.');
  await dataSource.dropDatabase();
  await dataSource.runMigrations();
  await seed();
});

afterAll(() => app.close());

describe('POST /students', () => {
  it('creates a student and returns 201', async () => {
    const teacherToken = await login(app, 'PROF001', 'password123');
    const res = await request(app.getHttpServer())
      .post('/students')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: 'New Student', belt: 'white' })
      .expect(201);
    expect(res.body).toMatchObject({ name: 'New Student', belt: 'white' });
  });
});
```

Helpers to share across specs in `test/support/`:
- `login(app, registry, password)` — POSTs `/auth/login`, returns access token.
- `expectProblemDetails(res, status, title)` — asserts `content-type: application/problem+json` and required RFC 7807 fields.

## Required e2e suites for v1 (write before shipping)

1. **`auth.e2e-spec.ts`**
   - login happy path; wrong password 401; missing JWT 401; rate-limit kicks in at 6th request within 60s.
   - refresh rotates the token; reusing a consumed refresh revokes the family.
   - logout invalidates the refresh; doesn't kill other devices in the same family.
2. **`teacher-isolation.e2e-spec.ts`** — **critical**
   - Seed two teachers (T1, T2) with disjoint students/classes/sessions/attendances.
   - For every `GET`/`PATCH`/`DELETE` endpoint, assert T1's token cannot access T2's resources (404, not 403, to avoid info leak).
3. **`students.e2e-spec.ts`** — CRUD; `belts[]` filter, `name` partial match, `notEnrolledInClass`, `notInSession`, pagination, belt-rank sort.
4. **`classes.e2e-spec.ts`** — CRUD + enroll/unenroll; soft-delete + restore; duplicate enrollment → 409 with `uq` constraint name; cannot enroll into a soft-deleted class.
5. **`class-sessions.e2e-spec.ts`** — CRUD; `by-date-range`; duplicate `(class, date)` → 409; `/start` and `/end` set times.
6. **`attendances.e2e-spec.ts`** — single create; `bulk/:sessionId` is idempotent; `mark-*` shortcuts set `checkedInAt` for PRESENT/LATE; guest attendance (`isEnrolledClass=false`) when student not enrolled.
7. **`problem-json.e2e-spec.ts`** — Validation 422 emits `errors[]`; unknown route 404 emits problem+json; an intentionally-broken handler returns 500 with problem+json and `ErrorReporter.captureException` is called (spy).

## Pitfalls

- `nestjs-pino` request-id logging during tests floods output. Use `LOG_LEVEL=silent` in `.env.test`.
- `ThrottlerGuard` is disabled when `NODE_ENV === 'test'` (see `AppModule`). The login rate-limit test needs to temporarily enable it — use a dedicated `auth-throttle.e2e-spec.ts` that boots a module with `NODE_ENV='development'`.
- `transform: true` + `enableImplicitConversion: true` means string query params become numbers automatically. Don't test by passing `page: '1'` explicitly cast; let the pipe do the work.
- E2E suites SHARE a single test DB. Run them serially (`--runInBand`) or use suite-scoped schema namespaces.
