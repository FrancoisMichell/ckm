# Seirin v2 — Recreation Specification

This folder is a **complete, self-contained spec** for rebuilding the Seirin martial-arts academy management API from scratch in a new repository. A fresh Claude Code session in the target repo should be able to read these documents top-to-bottom and produce a working v1 without ever opening the original source tree.

## What is Seirin?

A NestJS REST API for managing a martial-arts school: teachers register and authenticate, then manage students, schedule recurring classes, run individual class sessions, and track per-session attendance. Each teacher sees only their own data (the API is multi-tenant at the teacher level via an instructor self-relation on `users`).

## Reading order

Read in order. Each document assumes the previous ones.

1. [01-stack.md](01-stack.md) — exact pinned dependencies and versions
2. [02-domain-model.md](02-domain-model.md) — entities, fields, relations, enums
3. [03-api.md](03-api.md) — every endpoint with DTOs and response shape
4. [04-auth-and-rbac.md](04-auth-and-rbac.md) — JWT access + refresh, guards, decorators
5. [05-architecture-and-conventions.md](05-architecture-and-conventions.md) — module layout, error handling, logging
6. [06-database-and-migrations.md](06-database-and-migrations.md) — TypeORM setup, migration plan, indexes, seeds
7. [07-testing.md](07-testing.md) — unit and e2e expectations
8. [08-improvements-rationale.md](08-improvements-rationale.md) — what's changing vs. the v1 prototype and why
9. [09-bootstrap-checklist.md](09-bootstrap-checklist.md) — executable task list for the implementing agent

## CLAUDE.md templates

[claude-md-templates/](claude-md-templates/) holds ten CLAUDE.md files to copy into the new repo verbatim — one at the root, nine inside `src/<module>/`. They state only what cannot be inferred from reading the code. Do not duplicate root content into module files.

## How to use this with a fresh Claude Code session

In the new (empty) repo, kick off the rebuild with a prompt like:

> Read every file in `docs-recreation/` in order. Then execute `docs-recreation/09-bootstrap-checklist.md` end-to-end. Open issues for anything ambiguous before writing code.

Everything the agent needs is here. If a question can't be answered from this folder, that's a doc bug — fix the doc, don't guess.

## What this is NOT

- **Not a 1:1 reimplementation.** Stack patches are bumped, `isActive` is replaced by soft delete (`deletedAt`), JWTs become access + refresh, errors return RFC 7807 problem+json, and logging moves to pino with request IDs. See [08-improvements-rationale.md](08-improvements-rationale.md).
- **Not a roadmap.** Belt history, payments, notifications, dashboards, and Redis caching are explicitly out of scope for v1.

## Source of truth

When a document here disagrees with another, **the document with the more specific subject wins**: e.g. `02-domain-model.md` is authoritative for entity fields, `03-api.md` for endpoints, `04-auth-and-rbac.md` for auth flow. Flag the conflict for the human reviewer.
