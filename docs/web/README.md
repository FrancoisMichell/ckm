# Mestre Kame v2 — Recreation Spec

This folder is the **seed bundle** for recreating the Mestre Kame app from scratch in a fresh repository, as a **monorepo** containing both the web frontend and the existing NestJS backend. It is written to be consumed by AI coding agents (Claude Code) across multiple sessions.

> **Target repo name suggestion:** `mestre-kame` (or `kame`) — short, memorable, reusable.

---

## How to use this bundle

1. **Create a new empty Git repository.** Do not copy the old codebase into it.
2. **Copy this entire `docs-new-repo/` folder** into the new repo as `/docs/` (or keep the name).
3. **Open the new repo in Claude Code.** Place the `claude-md-templates/root-CLAUDE.md` content at the repo root as `CLAUDE.md`.
4. **Feed the agent the prompts in `08-AGENT-PROMPTS.md`** in order. Each prompt corresponds to a milestone in the roadmap.
5. As the agent scaffolds packages, it should drop in the matching `CLAUDE.md` for each package level (templates included).

---

## Document index

| # | File | When to read |
|---|------|--------------|
| 00 | [00-PROJECT-OVERVIEW.md](./00-PROJECT-OVERVIEW.md) | First. Vision, users, scope. |
| 01 | [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) | Before scaffolding the monorepo. |
| 02 | [02-DOMAIN-MODEL.md](./02-DOMAIN-MODEL.md) | Source of truth for entities, enums, rules. Shared by FE + BE. |
| 03 | [03-FRONTEND-SPEC.md](./03-FRONTEND-SPEC.md) | Building the web app. |
| 04 | [04-BACKEND-SPEC.md](./04-BACKEND-SPEC.md) | Building the API. |
| 05 | [05-UX-IMPROVEMENTS.md](./05-UX-IMPROVEMENTS.md) | What we are explicitly changing vs. the v1 app. |
| 06 | [06-IMPLEMENTATION-ROADMAP.md](./06-IMPLEMENTATION-ROADMAP.md) | Step-by-step build order. |
| 07 | [07-CONVENTIONS.md](./07-CONVENTIONS.md) | Coding standards, testing, commits. |
| 08 | [08-AGENT-PROMPTS.md](./08-AGENT-PROMPTS.md) | Copy/paste prompts for new Claude sessions. |
|   | [claude-md-templates/](./claude-md-templates/) | `CLAUDE.md` files to drop into the new repo at the matching paths. |

---

## TL;DR for impatient readers

- **Domain:** Brazilian Jiu-Jitsu academy management. Manage students, classes (weekly schedule), class sessions (specific dated occurrences), and attendance.
- **Frontend:** React 19 + Vite + TanStack Router + TanStack Query + Tailwind v4 + shadcn/ui + Zod + React Hook Form.
- **Backend:** NestJS 11 + TypeORM 0.3 + PostgreSQL + class-validator DTOs + JWT Bearer auth (no cookies; refresh-token rotation with family revocation). See [`docs/api/`](../api/) for the authoritative backend spec.
- **Monorepo:** pnpm workspaces + Turborepo.
- **Shared:** `packages/contracts` holds enums + branded IDs + pure helpers; transport request/response types are **generated** from the API's OpenAPI emit into `packages/contracts/src/api/`.
- **Improvements over v1:** in-memory access JWT + IndexedDB refresh token (no `localStorage` for either), offline-first attendance (PWA), generated API client (no hand-written hooks), feature-folder architecture, design system via shadcn.

---

## Non-goals for v2

- We are NOT migrating data from v1. Assume a fresh database.
- We are NOT preserving v1 API surface 1:1. The OpenAPI in v1 is informational; v2 backend rewrites the contract with Zod.
- We are NOT supporting mobile-native (yet). The web app is PWA-capable and tablet-optimized; native apps are future scope.
