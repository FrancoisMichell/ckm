# Tag audit -- v0.1.0-api-complete (full-codebase, post-M9)

Branch: feat/m09-e2e-hardening @ 0e59c37
Scope: entire apps/api (M2-M9) + packages/contracts. Cross-milestone interactions, accumulated
dependency risk, overall security posture. Auditor: milestone-auditor (Opus).

## Release-blocker invariant verification (code-level, not just tests)

- Teacher-isolation -> 404 never 403: PASS. Every feature service throws NotFoundException on
  cross-teacher access; no ForbiddenException in feature services. See TAG-2.
- No JWT secret fallback: PASS. JwtStrategy and all jwt/security config reads use getOrThrow. Joi
  requires JWT_SECRET (min 32). No fallback anywhere.
- Refresh-token family revocation on replay: PASS. AuthService.refresh revokes the whole family by
  family_id on a revoked-token presentation; rotation wrapped in a single transaction.
- is_enrolled_class set at insert, never recomputed: PASS. create/createBulk compute the snapshot
  only on the insert branch; idempotent returns return the stored row unchanged.
- No try/catch on PG error codes in services: PASS with one nuance (TAG-5).
- pino redaction of password/authorization/refresh_token: PARTIAL (TAG-3).
- Multi-tenancy every query scoped by currentUser.id: PASS with one gap (TAG-1).

## Phase 1 - Bugs (cross-milestone)

### TAG-B1 (low) - UsersService.update accepts arbitrary Partial<User>
update(id, patch) runs usersRepository.update(id, patch) with whatever it is given. Today every
caller (StudentsService.update) passes a whitelisted, ValidationPipe-scrubbed DTO, so there is no
live mass-assignment vector. But the type signature allows a future caller to pass
instructor/roles/registry straight through. Recommend tightening the parameter type or picking
allowed columns. Not a blocker, contained by current call sites.

### TAG-B2 (low) - Refresh expiry checked after rotation guards but never family-revokes
In AuthService.refresh an expired-but-not-revoked token returns 401 without revoking its family.
Defensible (expiry is not evidence of theft), but a stolen token used after expiry yields a clean
401 with the family still alive for any non-expired siblings. Document intended semantics. Info.

### TAG-B3 (info) - belt sort interpolates enum constants into raw SQL
UsersService.applySorting builds a CASE expression by interpolating Belt enum values into the query
string. These are compile-time constants from the contracts package, not user input, so no injection
vector. Flagged only so a future refactor making belt order user-configurable does not become SQLi.

## Phase 2 - Security (cross-milestone)

### TAG-1 (low) - StudentsService.validateExclusionFilters existence-checks not tenant-scoped
notEnrolledInClass / notInSession run SELECT 1 FROM classes or class_sessions WHERE id = param with
no teacher scoping. A teacher can distinguish class-id-exists-somewhere (200 with filtered list) from
class-id-does-not-exist (404) for another teachers class/session id, a low-severity cross-tenant
existence oracle. The code comment defers scoping to M5/M6 but it was never wired back into this M4
path. Parameterised query, so no SQLi. Recommend scoping to the calling teacher and returning 404
uniformly. Track before the FE consumes these filters in M12/M13.

> **RESOLVED** (fix-forward, branch `fix/tag-v0.1.0-followups`, after the tag): both checks are now
> teacher-scoped — `classes.id = $1 AND teacher_id = $2`, and `class_sessions` JOINs `classes` on
> `c.teacher_id = $2`. Foreign-teacher ids now return the same 404 as non-existent ids. Covered by 4
> unit specs + 4 teacher-isolation e2e cases. Not in the `v0.1.0-api-complete` tag (rides next tag).

### TAG-2 (info) - Teacher-isolation 404 enforced consistently
All feature services funnel cross-teacher access to NotFoundException. students uses a single
belongsToTeacher guard; classes/class-sessions/attendances use ownership-scoped query builders
(c.teacher_id = :teacherId) before any mutation. attendances additionally guards studentId via
resolveStudent so a teacher cannot attach a foreign student to their own session. No 403 path exists.

### TAG-3 (low) - pino redaction path globs miss deeper-nested bodies
pino.config.ts redacts req.headers.authorization, req.headers.cookie, and one-level-wildcard paths
for password, refresh_token, access_token, tokenHash, lookupHash (plus snake_case). The pino wildcard
matches exactly one segment, so the wildcard password path covers body.password and req.password but
NOT req.body.password (two segments under req). nestjs-pino does not serialize request bodies by
default, so credentials are not currently logged; the redaction net has a hole only if body logging
is later enabled. Recommend adding explicit req.body.password / req.body.refresh_token. Low severity.

> **RESOLVED** (fix-forward, branch `fix/tag-v0.1.0-followups`, after the tag): explicit
> `req.body.password` and `req.body.refresh_token` paths added to `pino.config.ts`. Not in the
> `v0.1.0-api-complete` tag (rides next tag).

### TAG-4 (info) - Auth hardening is strong
Constant-time credential validation via a precomputed dummy bcrypt hash; refresh tokens stored as
bcrypt hash plus SHA-256 lookup hash (never plaintext); bcrypt verify on refresh; rotation in a
transaction; family revocation on replay; Exclude on password/tokenHash/lookupHash/deletedAt plus
ClassSerializerInterceptor. helmet on, CORS locked to ALLOWED_ORIGIN credentials false, Swagger gated
behind SWAGGER_ENABLED, login throttled 5/60s. Positive posture.

### TAG-5 (info) - The one try/catch in services is not a PG-code catch
AuthService.refresh wraps revokeFamilyById in try/catch to report a transient DB failure during
family revocation while still returning a uniform 401. It does not inspect Postgres error codes and
does not pre-empt QueryFailedErrorFilter. Compliant with the invariant.

## Accumulated dependency risk (pnpm audit)

8 advisories total: 6 high, 2 moderate.

- tar (high x6, up to GHSA-qffp-2rhf-9h96): transitive via
  apps/api > bcrypt 5.1.1 > node-pre-gyp 1.0.11 > tar 6.2.1. Path-traversal / hardlink / symlink
  arbitrary file write during tar extraction. node-pre-gyp only runs tar at install/build time to
  unpack the prebuilt bcrypt binary, not at request time, against trusted bcrypt release artifacts,
  so runtime exposure is effectively nil. Options: (a) pnpm.overrides to force tar 7.5.10+ (verify
  node-pre-gyp tolerates tar 7), (b) drop node-pre-gyp bcrypt build (needs approval), or (c) accept
  as build-time-only. Recommend (a), fall back to (c) for the tag.
- vite (moderate x1, GHSA-4w7w-66w2-5vf9): transitive via
  packages/contracts > vitest 2.1.9 > vite 5.4.21. Dev/test-only path traversal. Never ships to prod.

No production-runtime-reachable CVE found. tar chain is build-time; vite is test-time.

## Overall posture

Strong shape for a v0.1.0-api-complete tag. Auth, multi-tenancy, soft-delete, idempotency, the
is_enrolled_class audit snapshot, and RFC 7807 error mapping all have code-level guarantees (not
merely test coverage), and the teacher-isolation e2e suite is comprehensive. No high-severity
application-logic or auth defect was found.

## Suggested suppressions
- TAG-3 (pino deep-body redaction gap): acceptable today since bodies are not logged; prefer
  hardening over suppression.
- vite moderate advisory: test-only, never shipped. Accept.
- TAG-B3 (belt CASE interpolation): enum constants, not user input. Accept.

## Blockers
None are hard release blockers. The tag can be cut. Two items to consciously decide first
(track, not block):

1. TAG-DEP: tar high advisories (x6) via bcrypt -> node-pre-gyp. Build-time only, runtime exposure
   negligible. Decide: pnpm.overrides for tar 7.5.10+, or formally accept as build-time-only.
2. TAG-1: cross-tenant existence oracle in students exclusion filters. Low severity. Fix before
   M12/M13 wire these filters into the FE; does not block the API-complete tag.
