# 07 — Conventions

These conventions apply to both `apps/web` and `apps/api` unless explicitly scoped. Agents should follow them without being asked.

---

## File & folder naming

| Thing | Convention | Example |
|---|---|---|
| React components | PascalCase `.tsx` | `StudentCard.tsx` |
| Non-component TS files | camelCase `.ts` | `queryKeys.ts`, `formatDate.ts` |
| Test files | same name + `.spec.ts` or `.test.ts` | `StudentCard.spec.tsx` |
| Playwright e2e | `*.e2e.ts` in `e2e/` | `attendance.e2e.ts` |
| Route files (TanStack Router) | `_layout.segment.$param.tsx` | `_auth.sessions.$id.attendance.tsx` |
| NestJS module folder | kebab-case | `class-sessions/` |
| i18n catalog files | `feature.json` | `student.json`, `attendance.json` |

---

## TypeScript

- **No `any`.** Use `unknown` + a type guard when the shape is truly unknown.
- **No non-null assertion (`!`)** except in test code where the shape is guaranteed by the test setup.
- **Infer don't duplicate.** If a type can be derived with `z.infer<typeof SomeSchema>`, do not write a parallel interface.
- **Explicit return types on exported functions** (except simple one-liners). Helps agents understand contracts without reading implementation.
- Strict mode on everywhere (`strict: true` in tsconfig).
- No `enum` keyword — use `z.enum([...])` or `as const` objects instead. Zod enums serialize cleanly; TS enums do not.

---

## React & components

- **Functional components only.** No class components.
- **Props as inline type literal**, not a named interface, unless the type is reused elsewhere.
  ```ts
  // Good
  function StudentCard({ student, onEdit }: { student: Student; onEdit: () => void }) {}
  // Only if reused:
  type StudentCardProps = { ... };
  ```
- **Co-locate state.** Lift state only when two sibling components need it. Do not hoist state to context preemptively.
- **No `useEffect` for data fetching.** TanStack Query handles this. `useEffect` is for DOM side-effects only.
- **Single responsibility.** A component file exports one default component. Small pure helpers can live in the same file but are not exported.
- **Export from barrel (`index.ts`) only what other features consume.** Internal sub-components are not re-exported.

---

## Comments

Default: **no comments.** The code should be self-explanatory through naming.

Write a comment only when the **why** is non-obvious:
- A non-obvious constraint or invariant.
- A workaround for a specific library bug.
- Intent that would surprise a future reader.

**Never write:**
- Comments restating what the code does (`// increment counter`).
- JSDoc for every function — only for public library APIs in `packages/`.
- TODO/FIXME in committed code. Open an issue instead.

---

## Naming

- **Be specific.** `useStudentFilters` not `useFilters`. `AttendanceStatusBadge` not `Badge`.
- **Booleans prefix with `is`, `has`, `can`, `should`.** `isLoading`, `hasErrors`, `canEnroll`.
- **Event handlers prefix with `handle` or `on`.** `handleSubmit`, `onStatusChange`.
- **Queries: noun or noun phrase.** `useStudentsQuery`, `useSessionAttendanceQuery`.
- **Mutations: verb phrase.** `useCreateStudent`, `useUpdateAttendanceStatus`.
- **Backend services: noun + `Service`.** `StudentsService`.
- **Backend controllers: noun + `Controller`.** `StudentsController`.

---

## Error handling

### Frontend
- **Never swallow errors silently.** Every `.catch()` either re-throws, shows a toast, or both.
- **Typed error union.** `ApiError | NetworkError | ValidationError`. Map via a single `getErrorMessage(error, t)` helper.
- **TanStack Query `onError`** for mutations — always show a toast at minimum.
- **Error boundaries** wrap each route.

### Backend
- **Services throw domain exceptions** (`NotFoundException`, `ConflictException`, custom `DomainException`).
- **`GlobalExceptionFilter` is the only place** that catches and formats errors into the standard shape.
- **Log stack traces at `error` level** only for unexpected errors (5xx). 4xx are `warn` or `info`.

---

## Testing

### Rules
1. **Tests are in `__tests__/` directories or `.spec.ts` co-located** — not in a separate `test/` root.
2. **Prefer integration over unit for services.** Test the service against the `postgres-test` container (`--runInBand`) rather than mocking the repository or DataSource.
3. **Mock at the boundary** (HTTP via MSW on the FE, not internal module mocks).
4. **Test behavior, not implementation.** Don't assert on internal state or private methods.
5. **Each test has one logical assertion.** Multiple `expect` calls per test are fine if they test the same behavior.
6. **No magic strings in tests.** Extract to named constants or use shared factory functions.
7. **Factory functions over fixtures.** `createStudent({ belt: 'blue' })` over importing a static JSON blob.

### Coverage targets
- `packages/contracts`: 100% schema validation coverage (every schema has valid + invalid examples).
- `apps/api` services: 80%+ line coverage.
- `apps/web` features: critical paths (forms, list + filter) must have component tests.
- E2e: login, create student, take attendance, logout.

---

## Git & commits

### Branch naming
`<type>/<short-description>` — e.g. `feat/attendance-offline`, `fix/refresh-token-rotation`, `chore/update-deps`.

### Commit messages (Conventional Commits)

```
<type>(<scope>): <short description>

[optional body]
[optional footer: BREAKING CHANGE, Closes #n]
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `style`.

Scopes match workspace packages: `contracts`, `web`, `api`, `root`.

Examples:
```
feat(web): add offline mutation queue for attendance
fix(api): prevent double-refresh when token expires mid-request
chore(contracts): add AttendanceWithStudent schema
```

### PR rules
- One logical change per PR.
- Squash merge to main (clean linear history).
- PR description: what changed, why, how to test.
- CI must be green before merge.

---

## Environment variables

### Backend (`apps/api/.env`)

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mestre_kame
JWT_ACCESS_SECRET=<random 32 bytes hex>
JWT_REFRESH_SECRET=<random 32 bytes hex>
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

All validated at boot via `env.schema.ts` (Zod). App refuses to start if any required var is missing.

### Frontend (`apps/web/.env`)

```
VITE_API_URL=http://localhost:3000/api/v1
```

Only vars prefixed `VITE_` are exposed to the browser bundle.

### `.env.example` files committed; `.env` files gitignored.

---

## Dependency management

- **pnpm only.** No npm/yarn commands.
- **Add to the right workspace.** `pnpm --filter web add react-hook-form`.
- **Keep `packages/contracts` dependency-free** except `zod` (and `typescript` as dev).
- **No `*` or `latest` versions.** Pin majors, allow patch: `"^x.y.0"`.
- **Audit weekly** (via Dependabot or `pnpm audit`).
