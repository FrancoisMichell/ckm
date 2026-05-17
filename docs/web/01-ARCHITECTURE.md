# 01 — Architecture

## Monorepo layout

```
mestre-kame/
├── apps/
│   ├── web/                      # React 19 + Vite frontend (PWA)
│   └── api/                      # NestJS 11 backend
├── packages/
│   ├── contracts/                # Zod schemas → types, validation, OpenAPI
│   ├── eslint-config/            # Shared ESLint flat config
│   ├── tsconfig/                 # Base tsconfig presets (base, react, node)
│   └── ui/                       # (Optional, phase 2) shared shadcn components
├── .github/workflows/            # CI: lint, typecheck, test, build per app
├── docker-compose.yml            # Local Postgres
├── turbo.json                    # Turborepo pipeline
├── pnpm-workspace.yaml
├── package.json                  # Root: scripts that fan out via turbo
└── CLAUDE.md                     # Root agent instructions
```

### Why this shape

- **`apps/` vs `packages/`** is the Turborepo convention. `apps/` are deployable; `packages/` are libraries consumed by apps.
- **`packages/contracts`** is the most important package. It defines Zod schemas for every entity and DTO. Both apps import from it. The backend uses them in pipes/guards; the frontend uses them in forms and as inferred query response types. This eliminates the FE/BE drift that plagued v1.
- **`packages/ui` is optional** for v2. Start with shadcn primitives directly inside `apps/web/src/components/ui/`. Promote to a shared package only when a second app needs them.

## Technology choices

### Frontend (`apps/web`)

| Concern | Choice | Why |
|---|---|---|
| Framework | **React 19** | Latest stable; `use` hook, actions, transitions. |
| Build | **Vite 7** | Fast HMR; mature; first-class TS. |
| Routing | **TanStack Router** | File-based, fully type-safe routes & search params. Replaces react-router v7. |
| Data fetching | **TanStack Query v5** | Better caching, mutations, optimistic updates than SWR. Replaces SWR. |
| API client | **openapi-fetch + openapi-typescript** (generated) | Generated from the OpenAPI emitted by the backend. No hand-written hooks. |
| Forms | **React Hook Form + @hookform/resolvers/zod** | Standard in 2026; pairs perfectly with shared Zod schemas. |
| Validation | **Zod** (from `packages/contracts`) | Single source of truth. |
| Styling | **Tailwind CSS v4** | Keep. v4's CSS-first config is mature. |
| UI primitives | **shadcn/ui + Radix** | Accessible by default; copy-into-repo model is great with agents. |
| Icons | **lucide-react** | shadcn default. |
| Toasts | **sonner** | Keep — already standard. |
| Date/time | **date-fns v4** | Keep. |
| State (client) | **Zustand** if needed | Most state is server state (Query). Use Zustand only for genuine client-side UI state. |
| i18n | **i18next + react-i18next** | PT-BR first; en-US ready. |
| Testing | **Vitest + Testing Library + Playwright** | Unit/component + e2e. |
| PWA | **vite-plugin-pwa (Workbox)** | Offline-first attendance. |
| Mock API (dev) | **MSW v2** | Keep. Handlers generated from contracts. |

### Backend (`apps/api`)

| Concern | Choice | Why |
|---|---|---|
| Framework | **NestJS 11** | User's existing stack; mature, opinionated. |
| ORM | **TypeORM 0.3** | Carried over from the v1 codebase; entity decorators + migration generator. See `docs/api/` for the authoritative backend stack. |
| Database | **PostgreSQL 16** | Industry standard. |
| Validation | **class-validator + class-transformer** | DTO decorators feed `@nestjs/swagger` for OpenAPI emit. Zod is reserved for frontend form-side validation only. |
| Auth | **JWT Bearer + refresh rotation with family revocation** | Access JWT (short-lived) in memory on the FE; refresh token (bcrypt-hashed at rest) issued separately and persisted in IndexedDB on the FE. No browser cookies. |
| Passwords | **bcrypt** | Carried over from v1; tuned cost factor. |
| Logging | **Pino + nestjs-pino** | Structured JSON in prod; pretty in dev. Field redaction list covers `password`, `authorization`, `refresh_token`. |
| Config | **@nestjs/config + Joi schema** | Validated env at boot; no fallbacks for `DB_*`, `JWT_SECRET`, `PORT`. |
| OpenAPI | **@nestjs/swagger** auto-generated from class-validator DTOs | Emits `openapi.json` for FE codegen via `openapi-typescript`. |
| Testing | **Jest (api) + Vitest (web)** | Jest is the v1 stack and keeps `@suites/unit` ergonomics; e2e runs against the `postgres-test` container `--runInBand`. |
| Migrations | **TypeORM migrations** | Tracked in `apps/api/src/db/migrations/`. Every constraint is named. |

### Shared (`packages/contracts`)

Pattern: **one schema per entity, `Create*` / `Update*` derived, types inferred.**

```ts
// packages/contracts/src/student.ts
export const BeltSchema = z.enum(['white','yellow','orange','green','blue','brown','black']);
export const StudentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(3).max(100),
  belt: BeltSchema,
  // ...
});
export const CreateStudentSchema = StudentSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const UpdateStudentSchema = CreateStudentSchema.partial();
export type Student = z.infer<typeof StudentSchema>;
export type CreateStudentInput = z.infer<typeof CreateStudentSchema>;
```

Never write a TS interface that duplicates a Zod schema.

## Cross-cutting principles

1. **Server state vs client state.** Server state lives in TanStack Query. Client state lives in component state or Zustand. Do not put fetched data into Zustand.
2. **Mutations are typed and invalidate by key.** Each mutation declares which query keys it invalidates.
3. **Optimistic UI for high-frequency actions.** Attendance status toggles MUST be optimistic.
4. **Feature folders.** `apps/web/src/features/attendance/` — not `apps/web/src/components/attendance/`.
5. **No business logic in components.** Components render and dispatch. Hooks contain orchestration. Pure functions contain rules.
6. **Errors are typed.** Discriminated union of error types. UI maps codes to i18n keys via a single helper.
7. **Date/time are explicit.** `date` = `YYYY-MM-DD` (no time). `startTime`/`endTime` = `HH:mm` (no date). Timestamps = ISO 8601 UTC.

## Build & dev orchestration (Turborepo)

`turbo.json` pipelines:

- `dev` — runs `web` and `api` in parallel; `contracts` watches and rebuilds.
- `build` — depends on upstream package builds; emits `dist/` per app.
- `lint`, `typecheck`, `test` — cached, parallelized.

Root scripts:

```jsonc
{
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "db:migrate": "turbo run db:migrate --filter=api",
    "openapi:generate": "turbo run generate-openapi --filter=api && turbo run generate-client --filter=web"
  }
}
```

`generate-client` reads `apps/api/openapi.json` and produces `apps/web/src/api/generated/` via `openapi-typescript`.

## Local dev workflow

1. `docker compose up -d` — start Postgres.
2. `pnpm install`
3. `pnpm --filter api db:migrate`
4. `pnpm --filter api db:seed`
5. `pnpm dev` — api on :3000, web on :5173.
6. If you change the API schema: `pnpm openapi:generate`.

## Deployment topology (for reference)

- **Web** → static hosting (Cloudflare Pages, Vercel, Netlify). PWA assets cached via Workbox.
- **API** → containerized (Fly.io, Railway, Render, or self-hosted). Reads `DATABASE_URL`.
- **Postgres** → managed (Neon, Supabase, RDS, or Fly Postgres).
- **Auth transport** → Bearer JWT in the `Authorization` header. No cookies; therefore no cross-domain cookie constraint between web and api in prod.

v2 does not prescribe a hosting provider — ask the user before choosing.
