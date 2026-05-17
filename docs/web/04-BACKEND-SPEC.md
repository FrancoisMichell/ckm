# 04 — Backend Spec

> **Superseded.** The original mestre-kame draft of this file targeted a different ORM,
> password hasher, auth-cookie transport, and login identifier than CKM uses. The
> authoritative backend specification for this monorepo lives under
> [`docs/api/`](../api/), ported from the seirin reference codebase.

Use these files as the source of truth for anything backend:

| Topic | File |
|---|---|
| Stack overview | [`docs/api/01-stack.md`](../api/01-stack.md) |
| Domain model (backend view) | [`docs/api/02-domain-model.md`](../api/02-domain-model.md) |
| HTTP API surface | [`docs/api/03-api.md`](../api/03-api.md) |
| Auth & RBAC | [`docs/api/04-auth-and-rbac.md`](../api/04-auth-and-rbac.md) |
| Architecture & conventions | [`docs/api/05-architecture-and-conventions.md`](../api/05-architecture-and-conventions.md) |
| Database & migrations | [`docs/api/06-database-and-migrations.md`](../api/06-database-and-migrations.md) |
| Testing | [`docs/api/07-testing.md`](../api/07-testing.md) |
| Bootstrap checklist | [`docs/api/09-bootstrap-checklist.md`](../api/09-bootstrap-checklist.md) |

CKM stack (TL;DR — see `docs/api/` for detail):

- **Framework**: NestJS 11
- **ORM**: TypeORM 0.3 (entities + named migrations)
- **Validation**: class-validator + class-transformer (no `nestjs-zod` on transport)
- **Auth**: JWT Bearer in the `Authorization` header — no cookies. Access token short-lived
  (in-memory on the FE); refresh token bcrypt-hashed at rest, family revocation on replay.
- **Passwords**: bcrypt
- **Login identifier**: `registry` (e.g. `0001`)
- **Logging**: pino with field redaction (`password`, `authorization`, `refresh_token`)
- **OpenAPI**: `@nestjs/swagger` emits from class-validator DTOs into
  `apps/api/openapi.json`; `pnpm openapi:generate` turns that into types under
  `packages/contracts/src/api/`.
