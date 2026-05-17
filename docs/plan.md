# Recreate Seirin + Mestre Kame as a Single Monorepo

## Model recommendations

- **Opus** — M0 (doc merging + agent definitions), M11a (design system spec, requires judgment),
  M16c (final polish + a11y + release), tag-level full-codebase audits (post-M9, post-M15,
  post-M16c), any cross-stack debugging session. Also recommended for any `milestone-auditor` run
  on a security-sensitive milestone (M3b, M7, M10, M12, M15) — adversarial reasoning benefits
  from the deeper model.
- **Sonnet** — everything else: M1–M9 backend implementation, M10 FE scaffold, M11b primitives,
  M12–M15 feature UI, M16a Dashboard, M16b PWA, `milestone-auditor` runs on
  non-security-sensitive milestones (M2, M4, M5, M6, M8, M9, M11b, M13, M14, M16a, M16b),
  `ux-mockup-author` sessions. The spec is tight enough that execution quality matters more than
  reasoning depth.

Switch manually at the start of each session. Don't bake model IDs into agent definitions — they go
stale as new versions ship.

### Automatic model-fit check at session start

Forgetting to switch models is the cheapest mistake in the project to prevent. Root `CLAUDE.md`
must include this instruction (one bullet at the top of the file, marked HIGH PRIORITY):

> **Model-fit check (highest priority — run before any other action):** if the user's first
> message in a session mentions starting a milestone or sub-step (e.g. "starting M5", "starting
> 3b.4", "kicking off M11a"), immediately:
> 1. Identify the milestone from the plan file at `~/.claude/plans/i-want-to-recreate-virtual-pillow.md`
>    (or the local copy in `docs/plan.md` once mirrored into the repo).
> 2. Read the **Model recommendations** section.
> 3. Compare against the agent's current model.
> 4. If mismatched, output a single-line warning *before* starting any work:
>    `⚠️ Model mismatch: this is <X> territory; you're on <Y>. Run /model <X> to switch, or tell me to proceed anyway.`
> 5. If the user mentions multiple sub-steps spanning both regions (e.g. "starting 11a through
>    11b in one session"), warn about the dominant model and let the user decide.
> 6. If no milestone is mentioned, ask for it once before starting work. Don't guess.

This instruction stays in `CLAUDE.md`, not in any agent definition — so every entry point
(main agent, specialist agents, even ad-hoc commands) inherits it.

**Optional hardening (Layer 2)**: a `SessionStart` hook in `.claude/settings.json` that prints
the Model recommendations table at every session start. Setup only if Layer 1 misses cases.
Hook example sketch (don't implement until M0, and only if you actually need it):

```json
{
  "hooks": {
    "SessionStart": [{
      "type": "command",
      "command": "cat docs/plan.md | grep -A 12 '## Model recommendations'"
    }]
  }
}
```

## Git workflow

Solo developer, single working directory, sequential milestones. No stacked PRs (overhead without
review-queue benefit), no worktrees (revisit only if parallel agent work becomes a bottleneck after M9).

**Branches**
- One branch per milestone: `feat/m<NN>-<short-slug>` (e.g. `feat/m03-users-auth`, `feat/m11-design-system`,
  `chore/m00-scaffold`).
- Always branch from `main`. Never branch from another feature branch.
- Hotfixes that block the next milestone: `fix/<slug>` from `main`, squash-merge like a feature. Don't
  pile fixes into an in-flight milestone PR.

**Commits inside the branch**
- Free-form and frequent — squashed at merge, so atomic-commit discipline isn't required during
  the agent session. Letting agents commit often is a cheap safety net for AI-driven work (easy revert
  inside the branch).
- Conventional Commits format still preferred (the squashed message defaults to the PR title; if you
  follow the format inside, the PR title basically writes itself).
- `husky` + `lint-staged` + `commitlint` (already in the plan's tooling) enforce on each commit.

**Pull requests**
- One PR per milestone. Title follows Conventional Commits scoped by app:
  - `chore(monorepo): M0 — scaffold`
  - `feat(api): M3 — users + auth`
  - `feat(web): M12 — students UI`
  - `feat(design): M11 — design system foundation`
- PR description template (drop into `.github/pull_request_template.md` during M0): link to the
  milestone section in this plan, paste the verification block you ran, attach screenshots for any FE
  work (and the `/__design/` gallery diff for design system PRs).
- **Verification gate is the merge gate**: don't merge until (1) the milestone's verification block in
  this plan passes locally, and (2) CI is green on the PR. Auto-merge on green CI is fine.

**Merge strategy**
- Squash merge only. Configure repo settings to disallow merge commits and rebase merges — keeps
  `main` history at exactly one commit per milestone.
- Squashed commit message: PR title verbatim. Co-authored-by lines for AI-agent commits are fine but
  optional.

**Branch protection on `main`**
- Require PR (no direct commits).
- Require CI green.
- Disallow force push.
- Even solo, this catches accidents (e.g. an agent running `git push --force` after a botched rebase).

**Tags / checkpoints**
- `v0.1.0-api-complete` after M9 (backend fully tested + coverage gate green).
- `v0.2.0-design-system` after M11 (tokens + primitives locked).
- `v0.9.0-rc` after M15 (attendance flow shipping; ready for polish).
- `v1.0.0` after M16 (PWA installable, Lighthouse passing).
- Annotated tags (`git tag -a vX.Y.Z -m "..."`), pushed explicitly.

**What this workflow buys you**
- `git log --oneline main` reads as a milestone-by-milestone build log.
- `git bisect` works cleanly (one commit = one milestone of behavior).
- Rollback of a bad milestone is `git revert <sha>` — one operation, no untangling.
- No tooling installs beyond what's already in the plan (Husky, commitlint, lint-staged).

## Sub-step protocol

Every milestone is executed as a numbered list of sub-steps inside the milestone branch. Each
sub-step ends in a working, verifiable state — the repo compiles, existing tests still pass, and
the new behavior has a one-line verification you can run (or visually confirm).

Conventions:
- Sub-step naming: `<milestone>.<n>` (e.g. `3a.4`, `11b.7`). Unsplit milestones use plain numbers
  (`5.3`, `12.6`).
- One commit per sub-step inside the branch. Commits are free-form (squashed at merge), so
  message hygiene matters less than the boundary itself.
- A sub-step is "done" only when its verification line is green. If it fails, fix and recommit;
  do not advance to the next sub-step with red state.
- Agents announce the sub-step they're starting at the top of each session message — e.g.
  "Starting 3b.4 — JwtAuthGuard + LocalAuthGuard + RolesGuard". Makes the trail readable.
- Sub-steps are deliberately small (1–3 files of net new code each, sometimes just a config
  change). If one starts to balloon past ~150 lines of diff, split it on the fly.
- Verification can be: a unit test passing, an e2e passing, `pnpm typecheck` exiting 0, a
  curl/psql probe, or a manual visual check on `/__design/`. Whatever is fastest and unambiguous.

This protocol matters more than PR boundaries. It keeps the agent's context window focused and
gives you a clean rollback point if any sub-step goes wrong.

**Total milestone count after splits: 20** (M0, M1, M2, M3a, M3b, M4, M5, M6, M7, M8, M9, M10,
M11a, M11b, M12, M13, M14, M15, M16a, M16b, M16c).

### Sessions per milestone

A milestone is not glued to a single session. Sub-steps are the unit of progress; sessions are
flexible containers for batches of sub-steps. Recommended sizing:

- **1–4 sub-steps**: one session.
- **5–7 sub-steps**: one session if context allows; two if it doesn't.
- **8+ sub-steps**: plan two sessions from the start; split at a logical seam.

Per-session recipe:

1. **Open session with a scope line** — e.g. "Starting 3b.1 through 3b.4". Pasting the milestone
   block from this plan + the scope line is enough context for the agent to start.
2. **Commit after each sub-step's verification passes** — these are the safe resume points.
3. **Stop at a sub-step boundary if context fills** — Opus past ~50%, Sonnet past ~70% usage is
   the soft threshold. Don't push through with a crowded window; quality drops fast.
4. **End with the branch green** — last commit must compile and pass any test that exists.
5. **Next session re-reads the milestone block**, picks up at the next sub-step. No need to ask
   the new agent to "summarize last session" — the commits already encode the state.

The branch and PR stay open across sessions. Only `git push` + merge happens once per milestone,
after the final sub-step.

### Mockup approval gate (FE feature milestones only)

For **M12, M13, M14, M15, M16a**, no feature code is written until the user has approved an HTML
mockup of the screens.

How it works:
1. At the start of the milestone, before sub-step `X.1`, the `ux-mockup-author` agent runs.
2. It produces static HTML mockup files at `apps/web/src/__mockups/<feature>/<screen>.tsx`,
   rendered at `/__mockups/<feature>/<screen>` (dev-only route, lazy-loaded so they don't ship
   to prod).
3. Mockups use **only** M11b tokens and primitives — same ESLint rule as feature code. No raw
   Tailwind colors, no inline hex.
4. Fake data inline; no API calls. Every relevant state covered (loading skeleton, empty, loaded,
   error). Mobile + desktop viewports.
5. User reviews in browser. Either approves (then `web-developer` proceeds to `X.1`) or asks for
   iteration. The mockup may go through 2–3 revisions; that's expected.
6. Approved mockup files **stay in the codebase** as the skeleton for the real implementation —
   `web-developer` references them in subsequent sub-steps. After the milestone merges, the
   `/__mockups/` route remains in dev-only for visual regression spot-checks.

Why HTML mockups (not Figma/v0/Excalidraw): the mockup uses your real design system, so the
approval *is* the visual contract — no designer-to-dev translation gap. Mockup file becomes the
starting code. No external tool, no account, no leaving the repo.

Skipped for: M0 (scaffold), M1 (contracts), M2–M9 (backend), M10 (no UI), M11a/M11b (the system
itself; reviewed on `/__design/` instead), M16b (PWA infra, no new visual surface), M16c (polish
audits against existing surfaces).

### Audit gate (every milestone with code)

Every milestone that touches code ends with an audit pass before the PR can merge. Two layers:

1. **Project-aware audit** by the `milestone-auditor` agent — runs in two phases inside one
   session: Phase 1 bug review (logic errors, null-safety, race conditions, error handling, test
   gaps); Phase 2 security review (auth boundaries, input validation, secret leakage, dependency
   risk). Scoped to the milestone's diff only. Knows the project invariants (teacher-isolation as
   release blocker, `is_enrolled_class` audit snapshot, no try/catch on PG error codes, Bearer
   token storage trade-off, refresh-token family revocation). Findings written to
   `docs/audits/m<NN>.md` AND summarized in chat.

2. **Generic security review** via the built-in `security-review` skill — a second pair of eyes
   with a different system prompt. Catches generic OWASP-style issues the project-aware agent
   might rationalize. Findings appended to the same `docs/audits/m<NN>.md`.

The `security-review` skill is **skipped** on these surface-less milestones: M0 (scaffold config),
M1 (pure types/enums), M11a (markdown spec), M16b (PWA build infra). For these, only the
project-aware `milestone-auditor` runs (it still has value as a sanity check). Every other
milestone gets both layers.

**Mid-milestone audit checkpoints** — extra audit passes before the highest-risk sub-steps:
- **M3b (auth)** between sub-step `3b.6` and `3b.7`. Review the AuthService rotation + family
  revocation logic before the controller + e2e land. Easier to fix invariants at the service
  layer than after the controller cements them.
- **M15 (attendance offline)** between sub-step `15.6` and `15.7`. Review the optimistic update +
  bulk action paths before the IndexedDB queue lands, so the queue's conflict-resolution strategy
  can be informed by the audit findings.

**Tag-level release audits** — at `v0.1.0-api-complete` (M9), `v0.9.0-rc` (M15), `v1.0.0` (M16c):
in addition to that milestone's normal audit, run a **full-codebase** pass with both layers. Tags
are release gates; cross-milestone interactions surface here that single-milestone audits can't
see.

**Suppressing repeat noise**: after triaging a finding that's a deliberate project decision (e.g.
"Bearer token in browser is an accepted XSS trade-off"), record the suppression in
`docs/audits/accepted-findings.md` with a one-line rationale. Future audits read this list at
session start and don't re-raise the same finding.

## Context

Two sibling projects (`seirin/` — NestJS backend; `mestre-ckm/` — Vite/React frontend) each carry their own
detailed recreation plan under `docs-recreation/` and `docs-new-repo/`. Both target the same BJJ academy
management domain (students, classes, sessions, attendance) but were planned independently, so they
contradict each other on backend stack, auth transport, and domain shape. Sending agents to execute
either plan today means re-resolving those conflicts every session.

This plan **collapses both into one canonical recreation plan**, executed as a **single new monorepo**
that supersedes both repos. Decisions already made with the user:

- **Backend stack wins from seirin**: NestJS 11 + TypeORM 0.3 + class-validator + JWT Bearer + bcrypt +
  registry login + RFC 7807 problem+json + 30-day family-tracked refresh tokens.
- **Frontend stack wins from mestre-kame**: Vite 7 + React 19 + TanStack Router/Query + Tailwind v4 +
  shadcn/ui + RHF + Zod (form validation only) + i18next + MSW (dev) + vite-plugin-pwa.
- **Repo strategy**: brand-new repo `ckm/` (rename freely); existing repos are archived for reference.
- **Domain**: seirin's unified `User` table + `UserRole` rows (TEACHER / STUDENT).
- **Plan format**: single living file (this one). Existing doc trees stay as reference material.

## Target monorepo layout

```
ckm/
├── apps/
│   ├── api/                      # NestJS backend (port of seirin)
│   └── web/                      # React PWA (port of mestre-kame)
├── packages/
│   ├── contracts/                # Shared enums + generated OpenAPI types
│   ├── eslint-config/            # Flat ESLint preset
│   └── tsconfig/                 # base.json / node.json / react.json
├── docker-compose.yml            # postgres + postgres-test
├── turbo.json                    # dev/build/lint/typecheck/test pipelines
├── pnpm-workspace.yaml
├── .github/workflows/ci.yml
├── CLAUDE.md                     # root agent instructions
└── docs/                         # consolidated, numbered spec docs (see Milestone 0)
```

`apps/api` mirrors seirin's `src/` layout (`common/`, `auth/`, `users/`, `students/`, `classes/`,
`class-sessions/`, `attendances/`, `health/`) plus `db/{datasource.ts, migrations/, seeds/}`.
`apps/web` mirrors mestre-kame's feature-folder layout (`src/features/<name>/{api,components,hooks,schemas}`).

## Design philosophy

The web app is not allowed to look like a generic shadcn-default CRUD dashboard. The goal is a
**distinctive, considered visual identity** that feels closer to a polished product than to a
back-office tool — without sacrificing the dense, scannable layouts the attendance workflow needs.

Concrete intent (to be sharpened once the user supplies visual references):

- **Identity over neutrality**: a real palette and typographic voice, not "slate/zinc + Inter at 16px."
  Tailwind v4 theme tokens are the source of truth; raw Tailwind utility colors are forbidden in
  feature code (lint rule).
- **Motion language is part of the brand**: every state change uses a tuned `cubic-bezier` from a
  short, defined easing set; never default browser linearity. Page transitions, sheet slides, status
  cycling, optimistic flashes, toast lifecycle — all from the same motion vocabulary.
- **Density without clutter**: the attendance screen must show 8–12 rows on a 5" phone without
  feeling cramped. The students table on desktop must show 15+ rows without horizontal scroll. We earn
  density by removing chrome, not by shrinking type.
- **One opinionated grid**: 4px base, 8px primary rhythm. Spacing tokens only — no arbitrary `gap-[7px]`.
- **Iconography is a single family, single weight, single stroke**. Mixing icon styles is a code-review
  reject. Default candidate: Lucide (matches shadcn); finalize after refs land.
- **Empty states are illustrated, not blank** — every list view ships with a designed empty state
  before that view is considered done.
- **Dark mode is first-class**, not an afterthought. Both modes are designed; neither is auto-derived
  from the other by HSL math.
- **Accessibility is not optional**: AA contrast minimum, color + icon + text on every status indicator,
  visible focus rings, 48px minimum touch targets on mobile. The design system spec calls this out per
  component; the agent rejects PRs that regress it.

**Reference materials (to be added by the user)**: a `docs/web/design-references/` directory will hold
inspiration images, palette pulls, type specimens, motion videos, and any direct references the user
shares later. The `ux-design-keeper` agent (defined below) reads this directory first whenever it
makes a design decision, and re-syncs the design system spec when the user drops in new refs.

## Consolidated stack decisions

| Concern              | Decision                                                                     | Source of truth |
|----------------------|------------------------------------------------------------------------------|-----------------|
| Node / package mgr   | Node 22 LTS, pnpm 9 workspaces, Turborepo                                    | both |
| Backend framework    | NestJS 11.1                                                                  | seirin 01-stack |
| ORM                  | TypeORM 0.3 (Prisma rejected)                                                | seirin 01-stack |
| Backend validation   | class-validator + class-transformer; ValidationPipe (422)                    | seirin 05 |
| Auth transport       | JWT Bearer in `Authorization` header (no httpOnly cookies)                   | seirin 04 |
| Password hashing     | bcrypt (`BCRYPT_SALT_ROUNDS` env)                                            | seirin 04 |
| Login identity       | `registry` (academy ID), not email                                           | seirin 04 |
| Refresh tokens       | 30 days, opaque + bcrypt-hashed, family-based replay detection               | seirin 04 |
| Error format         | RFC 7807 problem+json (`ProblemDetailsExceptionFilter`)                      | seirin 05 |
| Logger               | nestjs-pino (JSON, request IDs, secret redaction)                            | seirin 05 |
| OpenAPI              | `@nestjs/swagger` at `/api`; FE codegens client from emitted spec            | seirin 03 + mk 04 |
| DB                   | Postgres 16; `postgres` (dev) + `postgres-test` (e2e) containers             | seirin 06 |
| FE framework         | React 19 + Vite 7                                                            | mk 01 |
| FE routing/data      | TanStack Router (file-based) + TanStack Query v5                             | mk 01 |
| FE styling           | Tailwind v4 + shadcn/ui (Radix)                                              | mk 01 |
| FE forms             | React Hook Form + Zod resolver (FE-side validation only)                     | mk 01 |
| FE API client        | `openapi-fetch` over `openapi-typescript` types from backend Swagger         | combined |
| FE token storage     | Access token in memory; refresh token in IndexedDB (XSS-resistant). Document the trade-off explicitly. | this plan |
| FE i18n              | i18next, PT-BR default, en-US-ready                                          | mk 01 |
| FE PWA               | vite-plugin-pwa, IndexedDB mutation queue for offline attendance             | mk 05 |
| Tests (api)          | Jest 30 + supertest 7 + @suites; e2e `--runInBand` against `postgres-test`   | seirin 07 |
| Tests (web)          | Vitest + Testing Library + Playwright (login → attendance → logout)          | mk 07 |
| Git hygiene          | Husky + lint-staged + commitlint (Conventional Commits)                      | both |

## `packages/contracts` scope

Lightweight, framework-free. Holds:
- **Domain enums**: `Belt` (with PT label + hex color map), `AttendanceStatus`, `DayOfWeek`, `UserRoleName`.
- **Branded ID types**: `UserId`, `ClassId`, `SessionId`, `AttendanceId` (`string & { __brand: ... }`).
- **Pure helpers**: `getSessionStatus(session)`, belt ordering comparator.
- **Generated request/response types**: emitted by `pnpm openapi:generate` (api → `apps/api/openapi.json`
  → `openapi-typescript` → `packages/contracts/src/api/`). Re-exported from the barrel.

It does **not** hold Zod schemas as transport DTOs — backend uses class-validator. The web app may import
specific Zod schemas for form validation, but those live in `apps/web/src/features/<name>/schemas.ts`.

## Reuse map — existing docs feed each milestone

Both existing doc sets stay on disk inside the new repo's `docs/` directory at Milestone 0, so agents can
cite them. Mapping:

| New monorepo path                       | Sourced from                                                  |
|-----------------------------------------|----------------------------------------------------------------|
| `docs/api/00…09-*.md`                   | `seirin/docs-recreation/00-README.md` … `09-bootstrap-checklist.md` (copied verbatim) |
| `docs/web/00…08-*.md`                   | `mestre-ckm/docs-new-repo/00-PROJECT-OVERVIEW.md` … `08-AGENT-PROMPTS.md` (copied, then patched to drop Prisma/argon2/cookies/email login — see Milestone 0 Phase B) |
| `CLAUDE.md` (root)                      | Merge of `seirin/docs-recreation/claude-md-templates/root-CLAUDE.md` and `mestre-ckm/docs-new-repo/claude-md-templates/root-CLAUDE.md` |
| `apps/api/CLAUDE.md`                    | `seirin/docs-recreation/claude-md-templates/root-CLAUDE.md` (api-focused parts) |
| `apps/api/src/<module>/CLAUDE.md`       | `seirin/docs-recreation/claude-md-templates/src-<module>-CLAUDE.md` |
| `apps/web/CLAUDE.md`                    | `mestre-ckm/docs-new-repo/claude-md-templates/apps-web-CLAUDE.md` (patched: drop Prisma refs, switch auth to Bearer) |
| `packages/contracts/CLAUDE.md`          | `mestre-ckm/docs-new-repo/claude-md-templates/packages-contracts-CLAUDE.md` (patched: drop "Zod is the API DTO" line; reframe as "shared enums + generated OpenAPI types") |

## Milestones — execution order

Each milestone is one or two agent sessions. Order is chosen so the system is runnable end-to-end as
early as possible: backend auth + a single read endpoint, then web auth + that endpoint, then we fan
out feature by feature.

**M0 — Monorepo scaffold** *(Opus, 1–2 sessions, 6 sub-steps)*

Goal: empty but fully wired monorepo; nothing meaningful runs yet but every tool exits 0.

- `0.1` — `git init`, `.gitignore` (node, pnpm, turbo, .env, dist, coverage), `pnpm-workspace.yaml`,
  root `package.json` with turbo scripts, `turbo.json` with dev/build/lint/typecheck/test
  pipelines *(verify: `pnpm install` succeeds; `pnpm turbo --help` works)*.
- `0.2` — `packages/tsconfig/{base,node,react}.json` + `packages/eslint-config/index.js` skeletons
  *(verify: `pnpm typecheck` exits 0 across empty workspaces)*.
- `0.3` — `docker-compose.yml` with `postgres` (5432) + `postgres-test` (5433, db `ckm_test`)
  *(verify: `docker compose up -d` brings both up; both accept connections on their ports)*.
- `0.4` — Copy `docs/api/*` from `seirin/docs-recreation/` and `docs/web/*` from
  `mestre-kame/docs-new-repo/` verbatim, then patch `docs/web/` to drop Prisma/argon2/cookies/email
  *(verify: ripgrep `(?i)prisma|argon2|httpOnly cookie|email` against `docs/web/` returns zero hits;
  spot-check 3 patched files for coherence)*.
- `0.5` — Merged root `CLAUDE.md` (with the model-fit check instruction at the top) +
  `.claude/agents/{api-developer,web-developer,ux-design-keeper,ux-mockup-author,contracts-keeper,milestone-auditor}.md`
  (all six agents) + copy `C:\Users\franc\.claude\plans\i-want-to-recreate-virtual-pillow.md`
  to `docs/plan.md` and `C:\Users\franc\.claude\plans\RUNBOOK.md` to `RUNBOOK.md` (repo root)
  *(verify: each agent file has valid frontmatter; root CLAUDE.md links to all six and includes
  the model-fit check rule; both docs accessible at their new paths)*.
- `0.6` — `.github/workflows/ci.yml` (lint + typecheck + build + test on push/PR) +
  `.github/pull_request_template.md` *(verify: push a trivial commit to a `chore/m00-scaffold`
  branch; CI runs and passes)*.

**M1 — `packages/contracts` v0** *(Sonnet, 1 session, 4 sub-steps)*

Goal: shared enums + helpers compiled and tested; both apps will import from here. No generated API
types yet — those land in M10 after Swagger emits.

- `1.1` — Enums (`Belt`, `AttendanceStatus`, `DayOfWeek`, `UserRoleName`) + barrel export
  *(verify: `pnpm --filter contracts build` exits 0)*.
- `1.2` — Branded ID types (`UserId`, `ClassId`, `SessionId`, `AttendanceId`) + `BELT_CONFIGS` map
  (value → PT label + hex color) *(verify: `pnpm --filter contracts typecheck` exits 0)*.
- `1.3` — Pure helpers: `getSessionStatus(session)` derivation, belt comparator returning the
  rank order white(1)→black(7) *(verify: Vitest covers each helper with a representative case)*.
- `1.4` — Wire Vitest, write `src/index.ts` barrel re-exporting everything *(verify:
  `pnpm --filter contracts test` and `pnpm --filter web typecheck` against a probe import both pass)*.

**M2 — Backend foundation (`apps/api`)** *(Sonnet, 1–2 sessions, 7 sub-steps)*

Goal: NestJS app boots, connects to Postgres, has all the shared common-module infrastructure ready
for the auth milestone to land on.

- `2.1` — `nest new apps/api`, prune defaults, integrate with `packages/tsconfig/node.json`,
  install runtime + dev deps per `docs/api/09-bootstrap-checklist.md` Phase 0 *(verify:
  `pnpm --filter api build` exits 0)*.
- `2.2` — `db/datasource.ts` + `config/configuration.ts` with Joi schema (no fallbacks for DB_*,
  JWT_SECRET, PORT) *(verify: `.env.test` boots the DataSource; missing `JWT_SECRET` aborts startup
  with clear error)*.
- `2.3` — `src/common/`: decorators (`@Public`, `@Roles`, `@CurrentUser`), interfaces
  (`RequestWithUser`, `PaginatedResponse<T>`, `JwtPayload`), `IncludeDeletedDto`, `PasswordService`
  (bcrypt wrapper), `EntityUtil` *(verify: `pnpm --filter api typecheck` exits 0; unit tests pass
  for `PasswordService.hash/compare`)*.
- `2.4` — `ErrorReporter` interface + `NoopErrorReporter` default *(verify: unit test confirms
  `NoopErrorReporter.report()` is a no-op and returns void)*.
- `2.5` — `ProblemDetailsExceptionFilter` + `QueryFailedErrorFilter` (empty constraint map; will
  fill as migrations land) *(verify: unit tests cover HttpException → problem+json shape, unknown
  constraint → 500)*.
- `2.6` — Pino logger config (JSON, request IDs, redaction list) + `setupApp.ts` (ValidationPipe
  whitelist+transform+422, ClassSerializerInterceptor, both filters in correct order) *(verify:
  `nest start` logs structured JSON; redaction confirmed by hitting `/` with an `authorization`
  header and grepping logs for the literal token)*.
- `2.7` — Multi-stage `Dockerfile` (builder → runtime, only `dist` + prod node_modules in final
  image) + migration npm scripts (`migration:generate`, `migration:run`, `migration:revert`)
  *(verify: `docker build` succeeds; `npm run migration:generate -- --help` prints help)*.

**M3a — Backend: Users data layer** *(Sonnet, 1 session, 6 sub-steps)*

Goal: data layer for users is shippable on its own — migration applied, entity + service +
e2e of CRUD all green. Auth comes next in M3b.

- `3a.1` — Migration `1-CreateUsersAndRoles` with every constraint named (`uq_users_registry`,
  `uq_user_roles_user_role`, `fk_users_instructor`, indexes on soft-delete + teacher lookup +
  belt-rank) *(verify: `npm run migration:run` applies cleanly; `\d users` in psql shows the
  expected columns + named constraints)*.
- `3a.2` — `User` + `UserRole` entities + module barrel exports *(verify:
  `pnpm --filter api typecheck` exits 0; a probe DataSource query against the test DB returns
  expected metadata)*.
- `3a.3` — `UsersService.create / findById / findByRegistry / update` *(verify: @suites unit
  tests pass for happy path + duplicate-registry case)*.
- `3a.4` — `UsersService.findByRole` with LEFT JOIN + IS NULL exclusion-filter pattern
  (`notEnrolledInClass`, `notInSession`) + belt-rank CASE-expression sort *(verify: unit tests
  cover both filters and confirm ordering white→black)*.
- `3a.5` — Soft-delete via `@DeleteDateColumn`, `findOne({ withDeleted: true })` after
  `softRemove`, restore path *(verify: unit test asserts soft-delete sets `deleted_at` and
  default queries hide the row)*.
- `3a.6` — `UsersModule` + e2e `users.e2e-spec.ts` covering CRUD + soft-delete + filters
  *(verify: `pnpm --filter api test:e2e` passes against `postgres-test`; constraint map updated
  with `uq_users_registry`)*.

**M3b — Backend: Auth request layer** *(Sonnet, 1–2 sessions, 7 sub-steps)*

Goal: login/refresh/logout/me wired, JWT enforced globally, refresh-token rotation with family
revocation in place.

- `3b.1` — Migration `2-CreateRefreshTokens` with named constraints (`fk_refresh_user`,
  `idx_refresh_family`, partial index on non-revoked rows) *(verify: psql `\d refresh_tokens`
  matches spec; `family_id` column present)*.
- `3b.2` — `RefreshToken` entity + `AuthModule` skeleton *(verify: typecheck passes;
  `AuthModule` imports `UsersModule`)*.
- `3b.3` — `JwtStrategy` (uses `configService.getOrThrow('jwt.secret')`, no fallback) +
  `LocalStrategy` (validates registry + password via `PasswordService.compare`) *(verify: unit
  tests pass; missing JWT_SECRET aborts module bootstrap)*.
- `3b.4` — `JwtAuthGuard` (global via `APP_GUARD`, respects `@Public()`), `LocalAuthGuard`,
  `RolesGuard` *(verify: unit tests cover public-route bypass and roles enforcement)*.
- `3b.5` — `AuthService.validateCredentials` + `AuthService.login` (issues access JWT 15min +
  opaque refresh token, stores bcrypt hash + family_id) *(verify: unit test asserts
  `refresh_token` row created with `family_id` set)*.
- `3b.6` — `AuthService.refresh` (rotation: revoke consumed, issue successor in same family,
  set `replaced_by`) + `AuthService.logout` (revoke single token) + family-revocation on replay
  *(verify: unit test asserts consuming the same refresh token twice revokes every row sharing
  `family_id`)*.

  **🛡️ Mid-milestone audit (3b.checkpoint)**: `milestone-auditor` runs on the diff to-date before
  3b.7. Focus: JWT secret fallback (must be absent), bcrypt comparison timing, rotation atomicity,
  family-revocation completeness, refresh-token storage (bcrypt hash, not plaintext), throttler
  applied to login. Findings to `docs/audits/m03b-checkpoint.md`. Must be clean before continuing.

- `3b.7` — `AuthController` `/auth/{login,refresh,logout,me}` + Throttler 5/60s on `/login` +
  Swagger module enabled + e2e `auth.e2e-spec.ts` *(verify: e2e covers 200 login, 401 bad creds
  with problem+json, 401 after logout, family revocation on replay, 429 after rate limit)*.

**M4 — Backend: Students** *(Sonnet, 1 session, 4 sub-steps)*

Goal: students CRUD + filters + pagination behind teacher-scoped guards. Reuses M3a's
`UsersService.findByRole`.

- `4.1` — Port migration `3-AddStudentIndexes` from `seirin/db/migrations/` verbatim *(verify:
  `migration:run` applies cleanly; new indexes visible in psql)*.
- `4.2` — `StudentsService` delegating to `UsersService.findByRole(STUDENT)` with the
  current-user instructor scoping baked in *(verify: unit tests cover instructor-isolation
  case)*.
- `4.3` — `StudentsController` (`@Roles(TEACHER)` at class level) + `QueryStudentsDto`
  (name, registry, belts[], `notEnrolledInClass`, `notInSession`, sortBy, sortOrder, page, limit)
  + `CreateStudentDto`, `UpdateStudentDto` *(verify: typecheck + unit tests pass; Swagger UI shows
  every query param)*.
- `4.4` — e2e `students.e2e-spec.ts` covering CRUD + every filter + belt-rank sort + pagination
  + teacher-isolation smoke (full hardening lands in M9) *(verify: e2e passes;
  cross-teacher access returns 404, never 403)*.

**M5 — Backend: Classes + enrollments** *(Sonnet, 1 session, 6 sub-steps)*

Goal: classes CRUD, enroll/unenroll transactional, soft-delete + restore.

- `5.1` — Migration `4-CreateClassesAndEnrollments` with named constraints (`fk_classes_teacher`,
  `chk_classes_duration` 30-300, `pk_class_enrollments`, partial unique on non-deleted)
  *(verify: `migration:run` applies; psql shows CHECK constraint)*.
- `5.2` — `Class` entity (days simple-array of DayOfWeek, `start_time` HH:MM, audit FKs) +
  `ClassEnrollment` join entity *(verify: typecheck passes)*.
- `5.3` — `ClassesService.create / findAll / findOne / update / softDelete / restore`
  (teacher-scoped) *(verify: unit tests pass for happy path + cross-teacher 404)*.
- `5.4` — `ClassesService.enroll / unenroll` in a transaction (rollback on partial failure),
  enroll is idempotent *(verify: unit test asserts re-enrolling returns the existing row, no
  duplicate insert)*.
- `5.5` — `ClassesController` + DTOs (`CreateClassDto`, `UpdateClassDto`, `EnrollDto`)
  *(verify: Swagger shows POST `/classes/:id/enrollments` and DELETE `/classes/:id/enrollments/:studentId`)*.
- `5.6` — e2e `classes.e2e-spec.ts` covering CRUD + enroll/unenroll dedupe + soft-delete + restore
  + 409 on conflict *(verify: e2e passes; constraint map updated)*.

**M6 — Backend: ClassSessions** *(Sonnet, 1 session, 7 sub-steps)*

Goal: class-session CRUD, by-date-range query, start/end lifecycle, partial-unique-index dedup.

- `6.1` — Migration `5-CreateClassSessions` with partial unique index on
  `(class_id, date) WHERE deleted_at IS NULL`, named constraints throughout *(verify: psql
  `\d class_sessions` shows the partial index)*.
- `6.2` — `ClassSession` entity (date, start_time/end_time nullable, notes ≤500 chars, audit FKs,
  soft-delete) *(verify: typecheck passes)*.
- `6.3` — `ClassSessionsService.create / findAll / findOne / update / softDelete / restore`
  (teacher-scoped through class ownership) *(verify: unit tests pass; create same (class, date)
  twice → 409 mapped from constraint)*.
- `6.4` — `findByDateRange(from, to)` + `findByClass` + `findByTeacher` *(verify: unit tests
  cover boundary dates and empty range)*.
- `6.5` — `start()` (sets `start_time` = now, refuses if already started) + `end()` (sets
  `end_time` = now, refuses if not started) *(verify: unit tests cover both error transitions)*.
- `6.6` — `ClassSessionsController` + DTOs (`CreateSessionDto`, `UpdateSessionDto`,
  `DateRangeQueryDto`) *(verify: Swagger lists `/by-class`, `/by-teacher`, `/by-date-range`,
  `/start`, `/end`)*.
- `6.7` — e2e `class-sessions.e2e-spec.ts` covering CRUD + date-range + 409 dup + start/end
  transitions *(verify: e2e passes; constraint map updated)*.

**M7 — Backend: Attendances** *(Sonnet, 1 session, 7 sub-steps)*

Goal: single + bulk attendance create (idempotent), status shortcuts, `is_enrolled_class` audit
snapshot at insert time.

- `7.1` — Migration `6-CreateAttendances` with partial unique on
  `(session_id, student_id) WHERE deleted_at IS NULL`, status enum default PENDING, named
  constraints *(verify: partial index visible in psql; default works on bare INSERT)*.
- `7.2` — `Attendance` entity with `is_enrolled_class` boolean (set at insert, never updated),
  `checked_in_at` auto-set on PRESENT/LATE *(verify: typecheck passes; entity hook tests pass)*.
- `7.3` — `AttendancesService.create` (single, idempotent — returns existing row if conflict)
  *(verify: unit test asserts double-create returns the same `id` and never mutates)*.
- `7.4` — `AttendancesService.createBulk` (transactional, idempotent, computes
  `is_enrolled_class` snapshot from current enrollment at insert time) *(verify: unit test
  asserts re-running bulk on a session returns existing rows and does NOT update
  `is_enrolled_class` even if enrollment changed)*.
- `7.5` — `markPresent / markLate / markAbsent / markExcused` shortcuts (set status,
  `checked_in_at` on PRESENT/LATE, clear on ABSENT/EXCUSED) *(verify: unit tests cover state
  transitions and `checked_in_at` behavior)*.
- `7.6` — `AttendancesController` (single create, bulk create, mark-* shortcuts, find by
  session/student/status, update notes) + DTOs *(verify: Swagger lists every endpoint)*.
- `7.7` — e2e `attendances.e2e-spec.ts` covering bulk idempotency + guest attendance
  (`is_enrolled_class=false`) + every status shortcut + 422 on invalid status *(verify: e2e
  passes; constraint map updated)*.

**M8 — Backend: Health, AppModule wiring, seeds** *(Sonnet, 1 session, 6 sub-steps)*

Goal: app boots cleanly with all guards/filters wired, `/health` returns 200, dev DB is seedable,
manual smoke flow works end-to-end.

- `8.1` — `HealthController` with terminus + TypeORM indicator (public route via `@Public()`)
  *(verify: e2e `GET /health` → 200 with `{ status: 'ok' }`)*.
- `8.2` — `AppModule` final wiring: `ThrottlerModule` (100/60s default), `LoggerModule.forRoot`
  with pino config, `ErrorReporter` provider (Noop default), global `APP_GUARD` order:
  Jwt → Roles → Throttler *(verify: app boots without errors; an unauthenticated request to
  `/students` returns 401 problem+json)*.
- `8.3` — Swagger module mounted at `/api` (guarded by `SWAGGER_ENABLED` env flag) *(verify:
  visiting `/api` in dev shows every endpoint; in prod with flag off returns 404)*.
- `8.4` — `db/seeds/run-seed.ts` runner (refuses if `NODE_ENV === 'production'`) +
  per-entity idempotent seeders (1 teacher, 6 students, 1 class, 3 sessions) *(verify:
  `npm run seed` populates dev DB; running it twice doesn't duplicate rows)*.
- `8.5` — `main.ts` migration runner gated by `RUN_MIGRATIONS=true` *(verify: fresh DB +
  `RUN_MIGRATIONS=true npm run start:dev` boots and creates all tables)*.
- `8.6` — Full manual smoke flow: login as seeded teacher (registry `0001`) → list students →
  create a session → create attendance *(verify: every step returns 2xx; no errors in pino
  output)*.

**M9 — Backend: e2e hardening + coverage gate** *(Sonnet, 1–2 sessions, 7 sub-steps + tag audit)*

Goal: full e2e suite green, teacher-isolation invariant proven, coverage gate enforced in CI.

**🏷️ Release tag**: this milestone produces `v0.1.0-api-complete`. Post-milestone audit runs in
**full-codebase mode** (not just M9 diff) — see Audit gate section. Findings to
`docs/audits/tag-v0.1.0-api-complete.md`. Tag is annotated only after the audit is clean.

- `9.1` — Test support helpers in `test/support/`: `login(app, registry, password)`,
  `expectProblemDetails(res, status, title)`, shared seed function, factory builders *(verify:
  helpers compile; existing e2e suites refactor onto them without regression)*.
- `9.2` — `auth.e2e-spec.ts` hardened: rate-limit (5/60 returns 429), token rotation, family
  revocation on replay, JWT expiry behavior *(verify: every case passes)*.
- `9.3` — **`teacher-isolation.e2e-spec.ts` (release blocker)**: two teachers seeded, every
  feature endpoint queried cross-teacher returns 404 (never 403, to avoid info leak) *(verify:
  every endpoint covered; coverage report shows no holes)*.
- `9.4` — Extend `students.e2e-spec.ts`, `classes.e2e-spec.ts`, `class-sessions.e2e-spec.ts`,
  `attendances.e2e-spec.ts` to cover every filter combination + sort + pagination edge *(verify:
  all four suites green)*.
- `9.5` — `problem-json.e2e-spec.ts`: 422 validation error shape (`errors[]` array), 404 unknown
  route, 500 with `ErrorReporter` spy fires once *(verify: shapes match RFC 7807)*.
- `9.6` — Jest coverage config: thresholds lines 80, functions 80, branches 75, statements 80;
  ignore module/entity/DTO/setup-app/main *(verify: `pnpm --filter api test:cov` exits 0 with
  thresholds enforced)*.
- `9.7` — Update `.github/workflows/ci.yml` with `postgres` service container + e2e job
  *(verify: PR run executes e2e in CI and reports coverage)*.

**M10 — `packages/contracts` v1 + FE scaffold (no UI yet)** *(Sonnet, 1–2 sessions, 8 sub-steps)*

Goal: generated API types in `packages/contracts`, `apps/web` boots, auth round-trips with the
backend via Bearer token, MSW dev mocks wired. No designed UI yet — that's M11+.

- `10.1` — `pnpm openapi:generate` script: builds api → runs Swagger emit to `apps/api/openapi.json`
  → `openapi-typescript` into `packages/contracts/src/api/` + barrel re-export *(verify:
  `pnpm openapi:generate` emits a non-empty `api/index.ts`; `pnpm --filter contracts typecheck` exits 0)*.
- `10.2` — `apps/web` scaffolded via `pnpm create vite` (React + TS), wired to monorepo
  workspaces, `packages/tsconfig/react.json` as base *(verify: `pnpm --filter web dev` boots an
  empty page at :5173)*.
- `10.3` — TanStack Router (file-based) + TanStack Query installed; `__root.tsx` + a placeholder
  index route *(verify: root route renders; `pnpm --filter web build` succeeds)*.
- `10.4` — Tailwind v4 installed with an empty `@theme` block (real tokens land in M11a)
  *(verify: a probe `<div class="bg-white">` renders white)*.
- `10.5` — `src/api/client.ts`: `openapi-fetch` instance importing types from `@ckm/contracts`;
  Bearer header injector reading from in-memory access-token store; 401 interceptor → call
  `/auth/refresh` (refresh token from IndexedDB) → retry once; on refresh failure → emit `loggedOut`
  event *(verify: unit tests cover happy refresh, refresh failure, and double-401 not infinitely
  looping)*.
- `10.6` — `AuthProvider` (context with `user`, `login`, `logout`, `isAuthenticated`) + `useAuth`
  hook + TanStack Router `beforeLoad` guard for protected routes *(verify: smoke route `/__smoke`
  calls `/auth/me` and renders the JSON when authed, redirects to `/login` placeholder when not)*.
- `10.7` — i18next bootstrapped with PT-BR catalog skeleton (`auth`, `common` namespaces)
  *(verify: probe `t('common.loading')` renders the catalog string, not the key)*.
- `10.8` — MSW v2 set up in `src/test/msw/` with handlers importing `@ckm/contracts` types so
  mocks can't drift from the API *(verify: a Vitest with `setupFiles` activating MSW intercepts a
  fetch and returns the mocked shape; types match the real client)*.

**M11a — Design system spec + tokens** *(Opus, 1–2 sessions, 6 sub-steps; requires references in `docs/web/design-references/` first)*

Goal: canonical design spec written, runtime tokens shipped, motion vocabulary defined. No
component code yet — that's M11b. **Do not start until the user has dropped reference materials
into `docs/web/design-references/`.**

- `11a.1` — Read every file in `docs/web/design-references/` + write a 200-word preamble to
  `docs/web/design-system.md` summarizing the visual direction *(verify: user approves the
  preamble before continuing)*.
- `11a.2` — `docs/web/design-system.md` identity section: palette (brand, neutral, status), type
  ramp (display, h1-h4, body, mono, sizes + line-heights), iconography pick (lock the family + weight)
  *(verify: user signs off on identity; AA contrast checked for every text/background pairing)*.
- `11a.3` — Scales section: spacing (4px base, full ramp), radius, elevation/shadow, motion
  (easing curves + duration ramp: `instant 80ms`, `fast 140ms`, `base 220ms`, `slow 360ms`)
  *(verify: every scale documented with example usage)*.
- `11a.4` — Component playbook section: per-component (Button, Input, Select, Dialog, Sheet,
  Table, Card, Toast, EmptyState, Skeleton, Badge, StatusChip) — anatomy, states, a11y, do/don't,
  dark-mode pairing *(verify: every primitive M11b will build is specced; reviewed against
  references)*.
- `11a.5` — `apps/web/src/styles/tokens.css` Tailwind v4 `@theme` block with color scales (50-950
  for brand + neutral + status), semantic aliases (`--color-surface`, `--color-fg`,
  `--color-border`, `--color-accent`, status colors), spacing, radius, shadow, easing, duration.
  Dark mode via `@variant dark` *(verify: `pnpm --filter web build` succeeds; a probe component
  using `bg-surface` renders the right color in both modes)*.
- `11a.6` — `apps/web/src/styles/motion.ts` exporting `easeStandard`, `easeEnter`, `easeExit`,
  `easeEmphasized` curves + duration constants (Framer Motion installed) *(verify: typecheck
  passes; constants importable from a probe component)*.

**M11b — Design system primitives + ESLint rule** *(Sonnet, 1–2 sessions, 7 sub-steps)*

Goal: every primitive used in M12+ exists, consumes only tokens, renders on `/__design/`. ESLint
rule blocks raw Tailwind color utilities in feature code.

- `11b.1` — Button + Input + Label primitives, rewritten from shadcn to consume tokens only
  *(verify: visible on `/__design/`; no `bg-slate-*` or `text-zinc-*` anywhere in the diff)*.
- `11b.2` — Card + Badge + Skeleton primitives *(verify: visible on `/__design/`)*.
- `11b.3` — StatusChip (color + icon + text per spec) + EmptyState (illustrated slot + CTA)
  *(verify: visible on `/__design/`; StatusChip never relies on color alone)*.
- `11b.4` — Toast (sonner with token-styled defaults) + Dialog + Sheet primitives *(verify:
  visible on `/__design/`; Sheet animations use M11a easing curves)*.
- `11b.5` — Layout components: `Page`, `Header` (theme toggle + sync badge slot),
  `PageContainer`, `Section` *(verify: a probe page wraps content cleanly in light + dark)*.
- `11b.6` — Custom ESLint rule forbidding raw Tailwind color utilities in `apps/web/src/features/**`
  (only token-aliased utilities like `bg-surface`, `text-fg-muted` allowed there) *(verify: a
  deliberate `bg-red-500` in a fixture file triggers the rule; primitives in `src/components/ui/`
  are exempt)*.
- `11b.7` — `/__design/` route mounted in dev only, gallery of every primitive in every state
  (default, hover, focus, disabled, error, loading) + theme toggle *(verify: ux-design-keeper
  visual review passes; user signs off before M12 starts)*.

Exit criteria after M11b: a contributor can implement a feature screen in M12 without writing a
single hex code, without picking a font-size in pixels, and without inventing a new shadow.

**M12 — FE: Auth screens + Students** *(Sonnet, 1–2 sessions, 7 sub-steps + mockup gate)*

Goal: real login UI against the design system + the first feature surface (students list + detail).
First milestone where the app is visually usable.

**🔒 Mockup gate (12.0)**: `ux-mockup-author` produces `/__mockups/auth/login`,
`/__mockups/students/list-{loading,empty,loaded,error}`, `/__mockups/students/detail-{loaded,saving}`.
Mobile + desktop. User approves before sub-step 12.1.

- `12.1` — `/login` route + form (registry + password, RHF + Zod resolver, brand wordmark,
  illustrated panel, dark-mode aware), PT-BR strings via `t('auth.*')` *(verify: form renders
  with token styles; ux-design-keeper checklist passes)*.
- `12.2` — Wire form to `AuthProvider.login`; success → redirect to `/`; failure → toast with
  problem+json `detail` *(verify: manual login round-trip works against running api)*.
- `12.3` — Playwright e2e: `login → /auth/me → logout` on 375px viewport *(verify: e2e green
  headless)*.
- `12.4` — `/students` list scaffolding: paginated table view + card view toggle (responsive
  default), all chrome from M11b primitives *(verify: renders 15+ rows on desktop without
  horizontal scroll)*.
- `12.5` — Filters: debounced name search (300ms), belt multi-select chips, `isActive` toggle,
  empty-state when no rows match *(verify: filter queries hit api with correct params; empty
  state renders per M11a spec)*.
- `12.6` — `/students/:id` route with tabs (Perfil edit-in-place, Presenças placeholder, Turmas
  placeholder) + soft-delete button with undo toast (sonner) *(verify: PATCH round-trips;
  soft-delete + undo works within toast lifetime)*.
- `12.7` — Inline 30-day attendance % column color-coded via status tokens
  (≥80% success, 60-79% warning, <60% danger) *(verify: thresholds match spec; colorblind-safe
  variant tested by disabling color in DevTools)*.

**M13 — FE: Classes + enrollments** *(Sonnet, 1 session, 5 sub-steps + mockup gate)*

Goal: classes browsable + creatable; class detail surfaces roster with enroll/unenroll flow.

**🔒 Mockup gate (13.0)**: `ux-mockup-author` produces `/__mockups/classes/list-{empty,loaded}`,
`/__mockups/classes/new`, `/__mockups/classes/detail-{detalhes,alunos,aulas}`,
`/__mockups/classes/enroll-dialog`. User approves before sub-step 13.1.

- `13.1` — `/classes` card grid (each card: name, day pills `Seg/Qua/Sex`, time, enrolled count,
  teacher) *(verify: renders from api; cards consume M11b Card + Badge)*.
- `13.2` — `/classes/new` form (name, days multi-select, start_time, duration_minutes) +
  validation *(verify: POST round-trips; redirects to detail on success)*.
- `13.3` — `/classes/:id` Detalhes tab with edit-in-place form *(verify: PATCH round-trips;
  optimistic update with rollback on error)*.
- `13.4` — `/classes/:id` Alunos tab: roster list + "Inscrever" dialog with student picker using
  `notEnrolledInClass` filter + remove from roster action *(verify: enroll/unenroll round-trips;
  picker hides already-enrolled students)*.
- `13.5` — `/classes/:id` Aulas tab listing sessions for this class + "Nova aula" CTA
  placeholder (full session creation lands in M14) *(verify: list renders; CTA navigates to
  `/sessions/new?classId=...`)*.

**M14 — FE: Sessions** *(Sonnet, 1–2 sessions, 5 sub-steps + mockup gate)*

Goal: sessions browsable as calendar or list; detail with start/end controls; bulk schedule a month.

**🔒 Mockup gate (14.0)**: `ux-mockup-author` produces `/__mockups/sessions/list`,
`/__mockups/sessions/calendar-{month,week}`, `/__mockups/sessions/new`,
`/__mockups/sessions/detail-{scheduled,in-progress,completed}`,
`/__mockups/sessions/bulk-schedule`. User approves before sub-step 14.1.

- `14.1` — `/sessions` list view with filters (date range, class, status) and pagination
  *(verify: list renders from `/by-date-range`; filter combinations work)*.
- `14.2` — `/sessions` month/week calendar toggle with status-colored dots (scheduled,
  in_progress, completed, cancelled) *(verify: calendar navigates months; dot colors match
  status tokens; status uses icon + color, not color alone)*.
- `14.3` — `/sessions/new` form (class picker, date, start_time, duration override, notes)
  *(verify: POST round-trips; 409 on dup (class, date) shows inline error)*.
- `14.4` — `/sessions/:id` detail: start/end buttons (disabled in wrong state), actual-vs-scheduled
  time diff, notes inline-editable *(verify: start/end transitions update UI optimistically;
  rollback toast on error)*.
- `14.5` — Bulk-schedule-a-month dialog: pick class + month, preview the generated session list,
  confirm to create in one transactional bulk call *(verify: backend creates all sessions
  atomically; failure rolls back fully)*.

**M15 — FE: Attendance (the core)** *(Sonnet, 2 sessions, 7 sub-steps + mockup gate)*

Goal: the headline feature. Mobile-first attendance flow with optimistic cycling, bulk actions,
keyboard shortcuts, and full offline support. This milestone is the one to over-test.

**🔒 Mockup gate (15.0)** — *highest-stakes mockup in the project; budget 2–3 iteration cycles*:
`ux-mockup-author` produces `/__mockups/attendance/list-{pending,partial,complete}` on
**375×667 mobile** as primary, plus desktop, plus every interaction state:
`/__mockups/attendance/longpress-sheet`, `/__mockups/attendance/visitor-picker`,
`/__mockups/attendance/bulk-confirm`, `/__mockups/attendance/offline-banner`. User approves before
sub-step 15.1. Approval here gates the most expensive milestone in the plan — take the time.

**🏷️ Release tag**: this milestone produces `v0.9.0-rc`. Post-milestone audit runs in
**full-codebase mode**. Findings to `docs/audits/tag-v0.9.0-rc.md`. RC tag is annotated only
after the audit is clean and the M15 mid-milestone checkpoint findings are resolved.

- `15.1` — `/sessions/:id/attendance` scaffold: on first visit, bulk-create pending rows for
  every enrolled student (idempotent); list renders sorted by name with M11b primitives
  *(verify: re-visit doesn't duplicate rows; manual on 375px phone shows 8+ rows without
  cramping)*.
- `15.2` — Status badge tap cycles PENDING→PRESENT→LATE→ABSENT→EXCUSED with optimistic
  `setQueryData`; force-error path triggers rollback toast *(verify: 48px+ touch target; tap
  cycles correctly; throttling api to 500ms latency still feels instant)*.
- `15.3` — Long-press sheet (250ms) with full status picker + notes textarea *(verify: long-press
  opens, short-press cycles; notes save round-trips; sheet animations use M11a easing)*.
- `15.4` — "Todos presentes" bulk action with confirm dialog *(verify: marks every PENDING →
  PRESENT in one bulk call; PRESENT/LATE/ABSENT/EXCUSED rows untouched)*.
- `15.5` — "Adicionar visitante" floating button → student picker using `notInSession` filter →
  creates attendance with status=PRESENT and `is_enrolled_class=false` *(verify: visitor appears
  in list; backend snapshot is false; visual indicator distinguishes guests)*.
- `15.6` — Keyboard shortcuts: ↑/↓ navigate row, P/L/A/E mark status, Enter open notes, `/`
  focus search, Esc dismiss sheet *(verify: each shortcut works; focus ring visible on active
  row)*.

  **🛡️ Mid-milestone audit (15.checkpoint)**: `milestone-auditor` runs on the diff to-date before
  15.7. Focus: optimistic-update rollback correctness, race conditions in status cycling, bulk
  action idempotency, visitor-flow snapshot invariant (`is_enrolled_class=false`), missing
  TanStack Query invalidations, accessibility regressions in long-press + keyboard paths.
  Findings to `docs/audits/m15-checkpoint.md`. These findings explicitly inform the conflict
  resolution strategy in 15.7. Must be clean before continuing.

- `15.7` — IndexedDB mutation queue: when offline, mutations enqueue; `navigator.onLine` event
  drains the queue; conflict resolution = last-write-wins by server timestamp; header sync badge
  shows queue depth *(verify: DevTools offline → mark → online → mutation drains; badge
  decrements; Playwright test simulates the full offline flow)*.

**M16a — Dashboard** *(Sonnet, 1 session, 4 sub-steps + mockup gate)*

Goal: the `/` landing page surfaces what a teacher needs at the start of a shift.

**🔒 Mockup gate (16a.0)**: `ux-mockup-author` produces `/__mockups/dashboard/empty` (first-run,
no data) and `/__mockups/dashboard/loaded` (today's sessions + KPI cards populated). User
approves before sub-step 16a.1.

- `16a.1` — `/` route layout with token-styled card grid + empty state for first-run *(verify:
  empty state matches M11a spec; renders correctly with no data)*.
- `16a.2` — Today's sessions list with attendance progress bars (presents/total) and quick
  "Open attendance" action per row *(verify: progress bars reflect real data; click navigates
  to `/sessions/:id/attendance`)*.
- `16a.3` — Quick action buttons: "Novo aluno", "Nova turma", "Nova aula" *(verify: each links
  to the right route)*.
- `16a.4` — KPI cards: total active students, sessions this week, 7-day attendance %
  *(verify: numbers reactive to data changes; loading skeletons during fetch)*.

**M16b — PWA** *(Sonnet, 1 session, 4 sub-steps)*

Goal: app is installable and offline-capable beyond the M15 attendance flow.

- `16b.1` — `vite-plugin-pwa` with `injectManifest`; service worker registered in production
  build *(verify: `pnpm --filter web build` emits SW + manifest; preview build registers SW)*.
- `16b.2` — App-shell precache strategy (cache HTML, JS, CSS, fonts); navigation fallback to
  `/offline.html` *(verify: offline reload of `/students` renders cached shell)*.
- `16b.3` — Installable manifest: icons (192, 512, maskable), theme color from M11a tokens,
  app name + short_name in PT-BR *(verify: Chrome shows install prompt; installed app launches
  standalone)*.
- `16b.4` — Sync badge in `Header` reflecting IndexedDB queue depth from M15.7 *(verify: badge
  shows count offline; clears on successful drain)*.

**M16c — Polish + a11y + release** *(Opus, 1 session, 5 sub-steps + final release audit)*

Goal: ship-quality. Dark mode polished, a11y audit clean, session expiry handled gracefully,
README written, Lighthouse passing.

**🏷️ Release tag**: this milestone produces `v1.0.0`. Post-milestone audit runs in
**full-codebase mode** — the most thorough pass of the project. Findings to
`docs/audits/tag-v1.0.0.md`. Tag is annotated only when audit + all e2e + Lighthouse gates are
green. This is the last formal gate before the project is considered shipped.

- `16c.1` — Dark mode toggle in `Header` + `prefers-color-scheme` default + persistence in
  localStorage *(verify: toggle flips theme; reload persists; new visitor honors OS setting)*.
- `16c.2` — Session-expiry modal: on refresh failure, capture in-flight form state to
  sessionStorage, show modal with re-login form, restore form state on success *(verify:
  forced refresh-token revocation while editing a student form → modal → relogin → form
  restored with unsaved values intact)*.
- `16c.3` — a11y audit: axe-core integrated into Playwright e2e; AA contrast verified in both
  modes via automated tool *(verify: zero axe violations on `/`, `/students`, `/sessions/:id/attendance`,
  `/login`)*.
- `16c.4` — Lighthouse run on `/sessions/:id/attendance` at 375×667 viewport *(verify: PWA
  installable ✓, a11y ≥ 95, perf ≥ 90; report saved to `docs/web/lighthouse-baseline.json`)*.
- `16c.5` — Root `README.md` with quickstart (docker compose, pnpm install, migrate, seed,
  dev) + env vars table + the M15 final smoke flow *(verify: a fresh clone following the README
  reaches the smoke flow successfully)*.

## Critical files to be created (high-confidence list)

Root:
- `ckm/CLAUDE.md`, `ckm/turbo.json`, `ckm/pnpm-workspace.yaml`, `ckm/docker-compose.yml`,
  `ckm/.github/workflows/ci.yml`.

Shared:
- `packages/contracts/src/{belt.ts, attendance.ts, session.ts, ids.ts, index.ts}` plus `src/api/` (generated).
- `packages/tsconfig/{base,node,react}.json`, `packages/eslint-config/index.js`.

Backend (mirrors current `seirin/src/`):
- `apps/api/src/common/**`, `apps/api/src/{auth,users,students,classes,class-sessions,attendances,health}/**`,
  `apps/api/src/setup-app.ts`, `apps/api/src/main.ts`, `apps/api/db/datasource.ts`,
  `apps/api/db/migrations/*`, `apps/api/db/seeds/*`, `apps/api/test/**`.

Frontend:
- `apps/web/src/{routes,features/{auth,students,classes,sessions,attendance,dashboard},components/{ui,layout},api,i18n,test/msw}/**`.
- `apps/web/src/__mockups/<feature>/<screen>.tsx` (dev-only `/__mockups/...` routes, lazy-loaded
  and tree-shaken from prod builds). One mockup tree per FE feature milestone (M12, M13, M14, M15,
  M16a); reviewed and approved before any feature code lands.

Audit artifacts (created by `milestone-auditor`, **committed to the repo** — these are part of the
project record, not gitignored):
- `docs/audits/m<NN>.md` per milestone (e.g. `m03b.md`, `m05.md`, `m15.md`).
- `docs/audits/m03b-checkpoint.md`, `docs/audits/m15-checkpoint.md` (mid-milestone gates).
- `docs/audits/tag-v<X.Y.Z>.md` for each release tag.
- `docs/audits/accepted-findings.md` — running list of deliberate-trade-off acceptances
  (e.g. "Bearer token in browser is accepted XSS trade-off; see plan §Non-obvious decisions #1").

## Existing code to reuse (don't re-derive)

When porting from the current repos:
- **Migrations**: `seirin/db/migrations/*.ts` — port verbatim (rename `seirin_` → `kame_` only if the
  user wants the rebrand). They are already correct and named.
- **Belt-rank CASE sort + LEFT JOIN exclusion**: look at
  `seirin/src/users/users.service.ts` (current implementation), reuse as-is.
- **Problem+json filter**: `seirin/src/common/filters/problem-details-exception.filter.ts` — port verbatim.
- **`PasswordService`, `EntityUtil`**: port from `seirin/src/common/utils/`.
- **CLAUDE.md per-module templates**: already exist under
  `seirin/docs-recreation/claude-md-templates/` — drop into corresponding `apps/api/src/<module>/`.
- **FE feature scaffolding patterns**: `mestre-ckm/docs-new-repo/03-FRONTEND-SPEC.md` lines 89-156 for
  the attendance flow detail, `05-UX-IMPROVEMENTS.md` for the deliberate UX departures.
- **MSW idea**: `mestre-ckm/docs-new-repo/04-BACKEND-SPEC.md` (mock handlers tied to generated types).

## Non-obvious decisions worth flagging to executing agents

1. **Bearer token in the browser is an explicit XSS trade-off.** We accept it to keep the seirin auth
   contract intact. The mitigation is: access token never touches `localStorage`; refresh token in
   IndexedDB; aggressive CSP in `apps/web` `index.html`; never `dangerouslySetInnerHTML` user content.
   Document in `apps/web/CLAUDE.md`.
2. **Backend uses class-validator, not Zod, for transport.** `packages/contracts` holds **no Zod transport
   schemas**. Zod stays inside `apps/web` for form validation. The patched mestre-kame docs must be
   audited for this — any "Zod is the API contract" sentence becomes "Generated OpenAPI types are the API
   contract; Zod is for FE form validation."
3. **`is_enrolled_class` is an audit snapshot.** Never recomputed on read. Existing seirin tests cover this.
4. **Login by registry, not email.** Frontend login form has a "Registro" field, not "E-mail." Catalog
   strings under `i18n/locales/pt-BR/auth.json`.
5. **One `User` table powers both teacher and student APIs.** `/students` is `UsersService.findByRole(STUDENT)`
   with teacher-scoping. The mestre-kame docs that imply separate Teacher/Student tables must be patched
   in M0.
6. **Soft-delete is the only delete.** No hard delete endpoints. `/restore` exists per resource. The web
   "delete" UX is "Inativar" with undo.
7. **Refresh token rotation revokes the family on replay.** If a previously-consumed refresh token is
   presented again, mark `revoked_at` on every row sharing `family_id`. This catches stolen-token reuse.

## Specialist agents

For a port of this size, a handful of focused subagents (defined as markdown files in
`ckm/.claude/agents/`) prevents context drift between backend and frontend sessions and keeps
each agent's system prompt narrowly scoped. Six agents cover this build: backend, frontend
features, design system custodianship, feature mockup authoring, cross-stack contracts bridge,
and per-milestone audit.

All three are versioned with the repo. Each lives at `ckm/.claude/agents/<name>.md` with the
standard frontmatter block (`name`, `description`, optional `tools` whitelist) and a system prompt
body. Subagents can be invoked via the `Agent` tool with `subagent_type: <name>`.

### 1. `api-developer` — NestJS backend specialist

**Triggers when**: implementing or modifying anything under `apps/api/`, including modules,
migrations, guards, filters, or e2e tests. Drives milestones M2 through M9.

**System prompt highlights**:
- Stack: NestJS 11 + TypeORM 0.3 + class-validator + JWT Bearer + bcrypt + registry login + pino +
  RFC 7807 problem+json. Pin these — never substitute Prisma, argon2, Zod-on-transport, or cookies.
- Always read `docs/api/05-architecture-and-conventions.md` before writing service code, and
  `docs/api/06-database-and-migrations.md` before writing migrations.
- Migration rules: name every constraint, no `synchronize: true`, never edit a merged migration.
- Service rules: no try/catch on Postgres error codes (let `QueryFailedErrorFilter` map them);
  scope every query by `currentUser.id` (multi-tenancy); use LEFT JOIN + IS NULL for exclusions;
  use CASE expressions for belt-rank sort.
- Auth rules: no JWT secret fallback; refresh-token replay revokes the entire family; `@Roles` at
  controller class level (TEACHER unless explicitly public).
- Test rules: Jest for unit (`@suites/unit` TestBed), e2e against the `postgres-test` container
  serially (`--runInBand`); teacher-isolation suite is a release blocker.

**Tools**: full default set (needs Bash for migrations + npm scripts).

### 2. `web-developer` — Vite/React frontend specialist

**Triggers when**: implementing or modifying anything under `apps/web/`, including routes,
features, components, MSW handlers, or Playwright tests. Drives milestones M10, M12, M13, M14,
M15, M16a, M16b. (M11a/M11b go to `ux-design-keeper`; M16c is Opus polish.)

**System prompt highlights**:
- Stack: React 19 + Vite 7 + TanStack Router (file-based) + TanStack Query v5 + Tailwind v4 +
  shadcn/ui + RHF + Zod (form-side only) + i18next (PT-BR) + sonner + vite-plugin-pwa + MSW v2.
- API client: `openapi-fetch` over types imported from `@ckm/contracts`. **Never hand-write
  request/response interfaces** — they must come from the generated OpenAPI types. If a type is
  missing, run `pnpm openapi:generate` and use the regenerated one.
- Auth: access token in memory, refresh token in IndexedDB, never in localStorage. 401 →
  refresh → retry; refresh failure → redirect to login. Login by registry, not email.
- Feature folder discipline: cross-feature imports only via barrels (`index.ts`); no reaching into
  another feature's internals.
- React rules: functional components only, no `useEffect` for data fetching (TanStack Query
  handles it), no `any`, no `!` non-null assertions.
- Attendance flow rules (the core UX): optimistic updates via `setQueryData`, rollback toast on
  error, mobile-first 48px+ touch targets, status badge is the primary tap area, keyboard
  shortcuts P/L/A/E/↑/↓///Enter, "Adicionar visitante" uses the `notInSession` filter.
- i18n: every user-visible string via `t('feature.key')`; no hardcoded PT-BR text in components.
- Tests: Vitest + Testing Library for components, Playwright for the login → attendance → logout
  critical path on a 375px viewport.

**Tools**: full default set.

### 3. `ux-design-keeper` — design system custodian

**Triggers when**: editing `docs/web/design-system.md`, `apps/web/src/styles/**`, anything under
`apps/web/src/components/ui/` or `apps/web/src/components/layout/`, or whenever a new asset lands
in `docs/web/design-references/`. Also invoked **before** any feature-UI session in M12–M16c to
brief the `web-developer` agent on the relevant primitives. Drives milestones M11a and M11b;
reviews M12–M16c for design compliance.

**System prompt highlights**:
- Read order at session start: (1) `docs/web/design-system.md`, (2) any new files in
  `docs/web/design-references/` since last session, (3) the `/__design/` gallery route's current
  components. Never make a design decision without those three.
- Token discipline: every color, spacing value, type size, radius, shadow, easing curve, and
  duration must be a token. If a feature needs something that doesn't exist yet, **add the token
  first**, update `docs/web/design-system.md`, then use it. Never inline a one-off.
- shadcn primitives are starting points only — every primitive in `src/components/ui/` must be
  rewritten to consume tokens, not Tailwind raw color utilities. Reject PRs that import shadcn-
  default styles untouched.
- Motion: every interactive state change uses an easing curve + duration from
  `apps/web/src/styles/motion.ts`. No default browser easing, no `linear`.
- Accessibility floor: AA contrast on every text/background pairing in both light and dark mode
  (use a checker, don't eyeball); color + icon + text on every status indicator; visible focus
  rings; 48px minimum touch target on mobile. Block PRs that regress.
- Empty states are required artifacts, not afterthoughts. Every list view must ship with a designed
  empty state — illustrated, with a clear primary action.
- Iconography: one family, one weight, one stroke width. Document the chosen family in
  `design-system.md`; reject mixed icon sets.
- When the user drops new references into `docs/web/design-references/`, re-sync the spec: update
  the palette / type ramp / motion vocabulary as needed and call out in the PR description which
  components are affected so `web-developer` knows to revisit them.
- Output for design reviews: a checklist mapped to the spec sections (palette ✓, type ✓, spacing ✓,
  motion ✓, a11y ✓, empty state ✓, dark mode ✓, density ✓). Anything ✗ blocks merge.

**Tools**: Read, Edit, Write, Glob, Grep, Bash (for running the `/__design/` route + Lighthouse).

### 4. `ux-mockup-author` — feature mockup specialist

**Triggers when**: starting any FE feature milestone (M12, M13, M14, M15, M16a). Always runs
**before** the `web-developer` agent for that milestone. Mandatory gate per the Mockup approval
section above.

**System prompt highlights**:
- Read order at session start: (1) `docs/web/design-system.md`, (2) the milestone block from
  this plan for the feature being mocked, (3) every file under `apps/web/src/components/ui/` and
  `apps/web/src/components/layout/` so you know what primitives exist, (4) any prior mockups
  under `apps/web/src/__mockups/` for context on neighboring screens.
- Output: TSX files at `apps/web/src/__mockups/<feature>/<screen>.tsx`, registered under a
  dev-only `/__mockups/...` route that's lazy-loaded and tree-shaken out of production builds.
- Token discipline is identical to feature code: **no raw Tailwind color utilities, no inline
  hex, no arbitrary spacing values**. The same ESLint rule from M11b.6 applies. If a needed
  primitive doesn't exist, escalate to `ux-design-keeper` to add it — don't inline-style around it.
- Every screen state must be a separate sub-route: `list-loading`, `list-empty`, `list-loaded`,
  `list-error`, `detail-loaded`, `detail-saving`, etc. The user must be able to click through
  every state.
- Mobile-first if the screen will be used on mobile (always true for M15 attendance; usually true
  for M12 students). Mobile viewport = 375×667; desktop = 1280×800. Both screenshots in the PR
  description.
- Fake data inline. No fetch, no TanStack Query, no real state. A mockup that talks to anything
  is broken.
- Each session ends with a clear "Approve / Iterate" message listing every `/__mockups/...` URL
  for review. Iteration is expected — budget 2–3 cycles per feature milestone.
- After user approval, commit the mockup files with message `chore(web): M<NN> mockups approved`
  and hand off to `web-developer` for the first code sub-step. The mockup files stay in the
  branch — they're the implementation skeleton.

**Tools**: Read, Edit, Write, Glob, Grep, Bash (only for `pnpm --filter web dev` to spot-render).

### 5. `contracts-keeper` — interface synchronizer

**Triggers when**: a backend DTO, enum, or response shape changes, OR before the frontend starts
consuming a new endpoint, OR when `packages/contracts/` itself is touched. Short-lived sessions
only — kept tightly scoped so it doesn't drift into feature work.

**System prompt highlights**:
- `packages/contracts` holds **only**: domain enums (Belt, AttendanceStatus, DayOfWeek,
  UserRoleName), branded ID types, pure helpers (`getSessionStatus`, belt comparator),
  and **generated** OpenAPI request/response types under `src/api/`.
- Never hand-edit anything in `src/api/` — regenerate via `pnpm openapi:generate` (runs the api
  Swagger emit + `openapi-typescript` codegen).
- Never introduce a Zod transport schema here; the backend uses class-validator. If you find a
  Zod transport schema being added, push back and direct the change to `apps/web/.../schemas.ts`
  (form validation) or to backend DTOs (transport).
- After any change: run `pnpm --filter contracts build` and `pnpm --filter contracts test`.
  Then run `pnpm --filter web typecheck` to catch downstream breakage immediately.
- Enum drift check: every enum in `packages/contracts` must match the backend entity enum (string
  values identical). Grep both sides before merging.

**Tools**: Read, Edit, Write, Glob, Grep, Bash. No need for full agent fan-out.

### 6. `milestone-auditor` — per-milestone bug + security review

**Triggers when**: at the end of every milestone (after the last sub-step's verification passes,
before the PR is opened for merge). Also at the two mid-milestone checkpoints (M3b between 3b.6
and 3b.7; M15 between 15.6 and 15.7). At tag points, runs in full-codebase mode instead of
diff-scoped mode.

**System prompt highlights**:
- Read order at session start: (1) the milestone block from this plan, (2) `docs/audits/accepted-findings.md`
  to avoid re-flagging known-accepted issues, (3) `git diff main...HEAD` for the milestone branch
  (or full-codebase scan at tag points), (4) the affected module's `CLAUDE.md` for invariants.
- **Two-phase session, one agent, one report**:
  - **Phase 1 — Bug review**: logic errors, null-safety, off-by-one, race conditions in async
    paths, missing error handling, test gaps, dead code, type laundering (`any`, `as`, `!`),
    incorrect optimistic-update rollback, missing idempotency where the API promises it.
  - **Phase 2 — Security review**: auth boundary correctness (teacher-isolation as release
    blocker), input validation at every entry point, SQL injection (TypeORM raw queries),
    secret leakage in logs (pino redaction working?), JWT secret fallback (must be absent),
    refresh-token family revocation (replay = revoke all), Bearer token storage discipline
    (access in memory only, refresh in IndexedDB), `is_enrolled_class` audit-snapshot invariant,
    CSP + XSS for FE, dependency CVEs (`pnpm audit`), CORS config, throttler bypass paths.
- Project-specific invariants the agent must enforce (and block merge if violated):
  - Teacher-isolation: cross-teacher access returns 404, never 403.
  - `is_enrolled_class` is set at insert time and never recomputed on read.
  - No `try/catch` on Postgres error codes in services — let `QueryFailedErrorFilter` map them.
  - No JWT secret fallback in any strategy.
  - No raw Tailwind color utilities in `apps/web/src/features/**`.
  - No `dangerouslySetInnerHTML` with user content.
  - Refresh-token family revocation on replay (not just the consumed token).
  - Multi-tenancy: every feature query scoped by `currentUser.id`.
  - Bearer token never touches `localStorage`.
- **Output**: writes findings to `docs/audits/m<NN>.md` with sections: `## Phase 1 — Bugs`,
  `## Phase 2 — Security`, `## Suggested suppressions` (issues the user can accept and add to
  `accepted-findings.md`), `## Blockers` (must-fix before merge). Mirrors a chat summary with
  the same headings.
- **At tag points**: runs in full-codebase mode, additionally writes
  `docs/audits/tag-v<X.Y.Z>.md` covering cross-milestone interactions, accumulated dependency
  risk, and overall posture.
- **Followed by**: built-in `security-review` skill as a second pass with a different lens.
  Findings appended to the same `m<NN>.md`. Skipped on M0, M1, M11a, M16b (no security surface).
- **Never auto-fixes** — produces findings only. Fixes happen in subsequent commits via the
  responsible agent (`api-developer`, `web-developer`, etc.). This separation prevents the
  "agent that wrote the bug also marks it as not-a-bug" conflict of interest.

**Tools**: Read, Glob, Grep, Bash (for `git diff`, `pnpm audit`, running tests). No Edit or Write
to source code — only to `docs/audits/`. This restriction is intentional: auditor reports, it
doesn't patch.

### Where these agent definitions land

Created in Milestone 0:

```
ckm/.claude/
├── agents/
│   ├── api-developer.md
│   ├── web-developer.md
│   ├── ux-design-keeper.md
│   ├── ux-mockup-author.md
│   ├── contracts-keeper.md
│   └── milestone-auditor.md
└── settings.json          # optional: allowlist common pnpm/docker commands to cut prompts
```

The root `CLAUDE.md` should call these out by name with one-line trigger summaries so the
orchestrator (or you) knows when to delegate. Example lines:
- "For backend work under `apps/api/`, delegate to `api-developer`."
- "Before starting any FE feature milestone (M12/M13/M14/M15/M16a), delegate to `ux-mockup-author`
  first. No feature code lands until the user approves the mockup."
- "For frontend feature work under `apps/web/src/features/`, delegate to `web-developer` — but
  only after the milestone's mockup has been approved."
- "For anything touching the design system (`docs/web/design-system.md`,
  `apps/web/src/styles/`, `apps/web/src/components/ui/` or `layout/`), delegate to
  `ux-design-keeper`."
- "For anything touching `packages/contracts/` or cross-stack type sync, use `contracts-keeper`."
- "At the end of every milestone (and at mid-milestone checkpoints 3b.6→3b.7 and 15.6→15.7),
  delegate to `milestone-auditor`. No PR merges without its audit + the `security-review` skill
  (skipped on M0/M1/M11a/M16b). Findings live in `docs/audits/m<NN>.md`."

### When NOT to use a specialist

- Cross-cutting refactors (e.g., renaming an entity that ripples through both apps + contracts) —
  do those inline with the main agent, or chain the three specialists explicitly in sequence.
- Documentation, docs-only edits, CI workflow changes — main agent.
- Initial scaffolding (M0, M1) — main agent, since no app code exists yet to specialize on.

## Verification

Every milestone is gated on three things before merge: (1) all sub-step verifications green,
(2) `milestone-auditor` audit findings clean (or blockers explicitly resolved), (3) CI green on the
PR. Tag-bearing milestones add a full-codebase audit on top.

After **each milestone**, the executing agent must demonstrate:

- `pnpm install` clean, `pnpm turbo run typecheck` exits 0.
- `pnpm --filter api test` and (after M3) `pnpm --filter api test:e2e` pass.
- (After M10) `pnpm --filter web test` passes; `pnpm --filter web test:e2e` runs Playwright headless.
- `pnpm --filter api start:dev` boots, `/health` returns 200, Swagger reachable at `/api`.
- (After M10) `pnpm --filter web dev` boots on :5173, login form renders, login round-trips to api.

After **M16c** (final):
- `docker compose up -d` → `pnpm --filter api db:migrate` → `pnpm --filter api db:seed`
  → `pnpm dev` (turbo) brings api + web up.
- Smoke flow: login as seeded teacher (registry `0001`, password from seed) → create a student → create
  a class → enroll the student → create a session for today → mark the student present → see attendance
  rate update on `/students/:id`.
- All seven e2e suites pass with coverage ≥ thresholds.
- Lighthouse on `/sessions/:id/attendance` at 375×667 viewport: PWA installable, a11y ≥ 95, perf ≥ 90.

## Out of scope (deferred to v2.x)

- Belt history tracking.
- Payments / financials.
- Push notifications.
- Student-facing portal (the `STUDENT` role exists for future use; no UI for it yet).
- Redis caching.
- Multi-academy tenancy (single academy assumed; teacher-scoping is per-instructor only).
