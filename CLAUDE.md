# CKM — Monorepo

CKM is a BJJ academy management app: teachers, students, classes (weekly schedule),
class sessions (dated occurrences), and attendance. Multi-tenant per teacher.

Monorepo layout: pnpm workspaces + Turborepo.

- `apps/api` — NestJS 11 backend (TypeORM 0.3 + PostgreSQL, JWT Bearer auth).
- `apps/web` — React 19 + Vite frontend (PWA, mobile-first attendance, offline queue).
- `packages/contracts` — shared enums + branded ID types + pure helpers + **generated** OpenAPI
  request/response types under `src/api/`. Single source of truth for cross-stack contracts.
- `packages/tsconfig`, `packages/eslint-config` — shared tooling.

Detailed docs:
- Backend: [`docs/api/`](docs/api/) — stack, domain, HTTP API, auth, conventions, migrations, testing, bootstrap checklist.
- Frontend: [`docs/web/`](docs/web/) — architecture, domain (frontend view), frontend spec, UX, conventions. Design system lands in M11a at [`docs/web/design-system.md`](docs/web/design-system.md).
- Execution: [`RUNBOOK.md`](RUNBOOK.md) (session-by-session) and [`docs/plan.md`](docs/plan.md) (milestone-by-milestone reasoning).

---

## ✅ Model-fit check (run this at the start of every session)

Before doing any work, look at the active model and the work the user is asking for.
Use this map (derived from `RUNBOOK.md`'s session table — re-check there if unsure):

| Work type | Right model |
|---|---|
| Security-sensitive (auth, JWT, refresh-token rotation, password hashing, token storage) | **Opus** |
| Full-codebase audits at release tags (`v0.1.0-api-complete`, `v0.2.0-design-system`, `v0.9.0-rc`, `v1.0.0`) | **Opus** |
| Mid-milestone audits (M3b 3b.6→3b.7, M15 15.6→15.7) | **Opus** |
| Design-system spec authoring (M11a preamble + identity + scales + component playbook) | **Opus** |
| First FE feature mockup gates (M12, M15) and final polish (M16c) | **Opus** |
| Routine feature work, scaffolding, mid-milestone code | **Sonnet** |
| Per-milestone audits without release-tag scope (most) | **Sonnet** |

If the current model does not match the expected work type, **stop and tell the user**.
Recommend the right `/model …` switch and the right session number from `RUNBOOK.md`
before proceeding. Don't silently downgrade or upgrade.

---

## Specialist agents — when to delegate

Agent definitions live in [`.claude/agents/`](.claude/agents/). Each file has the system
prompt the agent runs with; this section is just the routing table.

| Agent | Delegate when working on |
|---|---|
| [`api-developer`](.claude/agents/api-developer.md) | Anything under `apps/api/` — modules, migrations, guards, filters, e2e. Drives M2–M9. |
| [`web-developer`](.claude/agents/web-developer.md) | Anything under `apps/web/src/features/` (and FE plumbing in M10). Drives M10, M12–M14, M15, M16a–b. **Only after the milestone's mockup gate is approved.** |
| [`ux-design-keeper`](.claude/agents/ux-design-keeper.md) | `docs/web/design-system.md`, `apps/web/src/styles/**`, `apps/web/src/components/ui/**`, `apps/web/src/components/layout/**`. Drives M11a + M11b. Briefs `web-developer` on primitives at the start of M12–M16c. |
| [`ux-mockup-author`](.claude/agents/ux-mockup-author.md) | Before any FE feature milestone (M12, M13, M14, M15, M16a). Produces `/__mockups/...` screens for the user to approve. No feature code lands until approval. |
| [`contracts-keeper`](.claude/agents/contracts-keeper.md) | Anything touching `packages/contracts/` or cross-stack type sync (DTO change, new endpoint about to be consumed by the FE, OpenAPI regen). Short-lived sessions. |
| [`milestone-auditor`](.claude/agents/milestone-auditor.md) | End of every milestone (before PR) and at the two mid-milestone checkpoints. **Findings only — no source edits.** Pairs with the built-in `security-review` skill (skipped on M0, M1, M11a, M16b). Writes to `docs/audits/m<NN>.md`. |

### When NOT to use a specialist

- Cross-cutting refactors that touch both apps + contracts — main agent, or chain the
  three specialists explicitly in sequence.
- Docs-only edits, CI workflow changes — main agent.
- Initial scaffolding (M0) — main agent, because the app code those specialists target
  does not yet exist.

---

## Stack — non-negotiable choices

These are pinned. Do not substitute without explicit user approval and a plan update.

### Backend (`apps/api`)
- **Framework**: NestJS 11
- **ORM**: TypeORM 0.3 (no `synchronize: true`; every constraint named in migrations)
- **DB**: PostgreSQL 16 (dev on 5432, test on 5433)
- **Validation**: class-validator + class-transformer (DTOs; never Zod on transport)
- **Auth**: JWT Bearer in `Authorization` header — no cookies. Refresh-token rotation
  with **family revocation on replay**. No JWT-secret fallback anywhere.
- **Passwords**: bcrypt
- **Login identifier**: `registry` (PT-BR field label "Registro")
- **Logging**: pino + nestjs-pino, structured JSON, redaction of `password`, `authorization`, `refresh_token`
- **Config**: `@nestjs/config` + Joi schema (no fallbacks for `DB_*`, `JWT_SECRET`, `PORT`)
- **OpenAPI**: `@nestjs/swagger` emits from class-validator DTOs; gated behind `SWAGGER_ENABLED` in prod
- **Test**: Jest (unit + e2e); e2e runs against `postgres-test` `--runInBand`
- **Errors**: `application/problem+json` (RFC 7807) via `ProblemDetailsExceptionFilter` + `QueryFailedErrorFilter`

### Frontend (`apps/web`)
- **Framework**: React 19 + Vite 7
- **Router**: TanStack Router (file-based)
- **Server state**: TanStack Query v5 (never `useEffect` for data fetching)
- **Styling**: Tailwind v4 + design tokens from `apps/web/src/styles/tokens.css`
  (no raw `bg-slate-*` etc. in `apps/web/src/features/**` — ESLint enforces this)
- **Primitives**: shadcn/ui rewritten to consume tokens; live in `apps/web/src/components/ui/`
- **Forms**: React Hook Form + Zod (form-side only — Zod never on transport)
- **i18n**: i18next, PT-BR primary
- **Toasts**: sonner
- **PWA**: vite-plugin-pwa (Workbox)
- **API client**: `openapi-fetch` over generated types in `packages/contracts/src/api/`. Never hand-write request/response interfaces.
- **Auth on FE**: access token in **memory only** (Auth context); refresh token in **IndexedDB**. Bearer header on every request. 401 → `/auth/refresh` → retry once → on failure clear + redirect to `/login`.
- **Mock**: MSW v2 for Vitest; handlers stay in sync with generated types.
- **Test**: Vitest + Testing Library (units), Playwright (critical path on 375×667 viewport).

### Shared (`packages/contracts`)
- Domain enums (`Belt`, `AttendanceStatus`, `DayOfWeek`, `UserRoleName`)
- Branded ID types (`UserId`, `ClassId`, `SessionId`, `AttendanceId`)
- Pure helpers (`getSessionStatus`, belt comparator)
- **Generated** OpenAPI types under `src/api/` (regenerate via `pnpm openapi:generate` — never hand-edit)

---

## Conventions

- **Soft delete only** on backend domain entities (`@DeleteDateColumn deletedAt`). No `isActive` booleans.
- **Multi-tenancy**: every backend feature query scoped by `currentUser.id`. The teacher-isolation e2e suite is a **release blocker**.
- **Teacher-isolation responses**: cross-teacher access returns **404**, never 403.
- **`is_enrolled_class`** on attendance rows is set at insert time and **never recomputed on read** — it's an audit snapshot.
- **No `try/catch` on Postgres error codes** in services. Name constraints and let `QueryFailedErrorFilter` map them.
- **No `dangerouslySetInnerHTML`** on user content.
- **PT-BR strings** via `t('feature.key')` only — no hardcoded text in components.
- **Conventional Commits** for every commit: `feat(api): ...`, `fix(web): ...`, `docs(runbook): ...`, `chore(contracts): ...`.
- **pnpm only.** Never `npm` or `yarn`.

---

## Commands

```bash
pnpm install                          # install all workspaces
docker compose up -d                  # start postgres (5432) + postgres-test (5433)
pnpm --filter api migration:run       # apply migrations against dev DB
pnpm --filter api seed:dev            # seed dev DB (admin registry 0001)
pnpm dev                              # api (:3000) + web (:5173) + contracts watch
pnpm build                            # build all
pnpm test                             # unit tests
pnpm --filter api test:e2e            # e2e (uses postgres-test --runInBand)
pnpm typecheck                        # typecheck all
pnpm lint                             # lint all
pnpm openapi:generate                 # api swagger emit → regenerate contracts/src/api types
pnpm --filter <name> <script>         # run a script in a specific workspace
```

---

## Pitfalls (carried lessons)

- Don't `synchronize: true` TypeORM. Always migrate.
- Don't edit an already-merged migration — write a new one.
- Don't leak `password` or `deletedAt` in responses; `@Exclude()` + `ClassSerializerInterceptor` handles it but e2e verifies.
- Don't let `STUDENT`-role users hit teacher-only endpoints. `@Roles(UserRoleType.TEACHER)` at the **class** level.
- Don't call `softRemove` and then `save` on the same entity in the same transaction without `withDeleted: true` on subsequent finds.
- Don't put fetched data into Zustand or component state — TanStack Query owns server state.
- Don't add a Zod transport schema in `packages/contracts/` — push it to the FE form-side or to a backend DTO.
- Don't write a TS interface that duplicates a generated OpenAPI type.
