# M3b Mid-milestone Checkpoint Audit (3b.6 → 3b.7)

**Date**: 2026-05-18
**Branch**: `feat/m03b-auth-request-layer`
**Scope**: `git diff main...HEAD` covering 3b.1–3b.6 (RefreshToken migration + entity, AuthModule skeleton, JwtStrategy + LocalStrategy, JwtAuthGuard + LocalAuthGuard + RolesGuard, AuthService.validateCredentials + login, AuthService.refresh + logout + family revocation).
**Model**: Opus 4.7

Source files reviewed:
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/auth/auth.module.ts`
- `apps/api/src/auth/entities/refresh-token.entity.ts`
- `apps/api/src/auth/strategies/jwt.strategy.ts`
- `apps/api/src/auth/strategies/local.strategy.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/config/configuration.ts`
- `apps/api/src/common/logger/pino.config.ts`
- `apps/api/src/common/utils/password.service.ts`
- `apps/api/src/users/users.service.ts`
- `apps/api/db/migrations/3-CreateRefreshTokens.ts`

---

## Phase 1 — Required focus areas

### 1. JWT secret fallback — PASS

- `apps/api/src/config/configuration.ts:19` declares `JWT_SECRET: Joi.string().min(32).required()`. No default, fails fast at boot.
- `apps/api/src/auth/auth.module.ts:30` uses `configService.getOrThrow<string>('jwt.secret')`.
- `apps/api/src/auth/strategies/jwt.strategy.ts:25` also uses `getOrThrow<string>('jwt.secret')`.
- No `process.env.JWT_SECRET || ...` anywhere in the diff.
- `apps/api/src/auth/strategies/jwt.strategy.ts:24` sets `ignoreExpiration: false`.

### 2. bcrypt comparison timing — HIGH (username-enumeration oracle)

**File**: `apps/api/src/auth/auth.service.ts:60-72`

`validateCredentials` short-circuits with no bcrypt call when: registry is unknown, registry exists but `password` column is null, or row is soft-deleted. When the row exists with a password, bcrypt runs at cost 10 (~60–100 ms). When it does not, the function returns in DB-roundtrip time (~1–5 ms). One-to-two orders of magnitude delta is trivially measurable over the network, enabling registry enumeration prior to credential stuffing.

**Fix shape**: precompute a fixed dummy bcrypt hash at module init, and `bcrypt.compare(supplied, dummyHash)` in the missing/passwordless/deleted branches before throwing the same `UnauthorizedException`. Discard the result.

### 3. Rotation atomicity — HIGH (non-atomic rotation)

**File**: `apps/api/src/auth/auth.service.ts:191-207`

Flow today:
1. `refreshTokenRepo.save(newRow)` — line 201, separate DB call.
2. `refreshTokenRepo.update(existingRow.id, { revoked: true, replacedBy: savedNewRow.id })` — line 204, separate DB call.

No `DataSource.transaction()` wrapper. If the process crashes or the connection drops between the two writes, the DB is left with a new active row in the family AND the old row still `revoked = false`. The client's old token is still acceptable on the replay-check path — silently defeats replay detection for this family.

**Fix shape**: wrap both ops in `this.refreshTokenRepo.manager.transaction(async (em) => { ... })` (or inject `DataSource`). Insert the new row and update the old row inside the same TX.

### 4. Family-revocation completeness on replay — PASS (with one note)

**File**: `apps/api/src/auth/auth.service.ts:259-266`

```ts
.update(RefreshToken)
.set({ revoked: true })
.where('family_id = :familyId AND revoked = false', { familyId })
.execute();
```

Walks every row in the family by `family_id`. Correct shape. Test coverage at `auth.service.spec.ts:406-423`.

**Note (Info)**: revocation runs before the 401 is thrown but is not awaited inside a transaction with anything else. If revocation fails transiently, the user gets a 401 (good) but the family stays active (bad). See L2 below.

### 5. Refresh-token storage (bcrypt hash, not plaintext) — PASS

- `refresh-token.entity.ts:38-43` declares `tokenHash` and `lookupHash`; both `@Exclude()`'d.
- Insert path `auth.service.ts:107-119`: `randomBytes(48).toString('base64url')`, bcrypt hash stored, SHA-256 lookup hash stored, plaintext only in response body.
- Lookup path `auth.service.ts:151-165`: `findOne({ where: { lookupHash } })` then `bcrypt.compare(rawToken, existingRow.tokenHash)`.
- Migration `3-CreateRefreshTokens.ts:22-23`: `token_hash TEXT NOT NULL`, `lookup_hash TEXT NOT NULL` with UNIQUE on `lookup_hash`.
- Test coverage `auth.service.spec.ts:203-225` asserts `tokenHash !== plaintext` and bcrypt round-trip.

### 6. Throttler on `POST /auth/login` — DEFERRED (acceptable for checkpoint)

- `@nestjs/throttler` installed.
- `app.module.ts:68` comment: `// Throttler guard is added in M8 alongside ThrottlerModule.`
- `docs/plan.md:483` (3b.7 spec): `+ Throttler 5/60s on /login`.

`AuthController` does not yet exist, so there is nothing to rate-limit. Comment in `app.module.ts:68` says "M8" but plan.md schedules throttler decoration for 3b.7. Resolve in 3b.7 when wiring the controller. Becomes a blocker if 3b.7 lands without it.

---

## Phase 2 — Other security smells

### Pino redaction — PARTIAL PASS (MEDIUM gap)

**File**: `apps/api/src/common/logger/pino.config.ts:23-31`

Redacted: `req.headers.authorization`, `req.headers.cookie`, `*.password`, `*.refresh_token`.

**Gaps** (Medium):
- `*.access_token` not redacted. Any log of `/auth/login` or `/auth/refresh` response body would leak the access token.
- `*.tokenHash`, `*.lookupHash` not redacted (plus snake_case mirrors). If a `RefreshToken` entity is ever debug-logged, the SHA-256 lookup hash leaks — equivalent to the plaintext for refresh-request indexing.

### `AuthService.logout` policy — NOTED

`auth.service.ts:236-249` revokes only the single token presented. Matches plan §3b.6 ("revoke single token"). Intentional; spec comment at lines 233-234 documents this. No issue.

### `password` / `deletedAt` leakage — PASS

`user.entity.ts:27-29,56-58` mark `password` and `deletedAt` with `@Exclude()`. `refresh-token.entity.ts:37-43` follows the same pattern. E2E verification belongs in 3b.7.

### `console.log` in auth paths — PASS

Grep returned no matches in `apps/api/src/auth`.

### JwtStrategy `ignoreExpiration` — PASS

`jwt.strategy.ts:24`: `ignoreExpiration: false`.

---

## Findings summary by severity

### BLOCKERS (must fix before 3b.7)

- **H1 — bcrypt timing oracle in `validateCredentials`** — `apps/api/src/auth/auth.service.ts:60-72`. Always call `bcrypt.compare` (against a constant dummy hash) even when the user is not found, has no password, or is soft-deleted. Eliminates the registry-enumeration side channel.
- **H2 — Non-atomic refresh-token rotation** — `apps/api/src/auth/auth.service.ts:201-207`. Wrap the new-row insert and the old-row update in a single transaction.

### MEDIUM (should fix before 3b.7)

- **M1 — Pino redaction misses `access_token`, `tokenHash`, `lookupHash`** — `apps/api/src/common/logger/pino.config.ts:23-31`. Add `*.access_token`, `*.tokenHash`, `*.lookupHash`, `*.token_hash`, `*.lookup_hash`.

### LOW

- **L1 — Dead `user.deletedAt` branch** — `apps/api/src/auth/auth.service.ts:62`. `usersService.findByRegistry` already filters via `@DeleteDateColumn`. Branch is unreachable; remove alongside the H1 fix.
- **L2 — Family-revocation failure is silent** — `apps/api/src/auth/auth.service.ts:169`. Wrap `revokeFamilyById` with try/catch and log at `error` via ErrorReporter; keep throwing 401 to the user.

### INFO

- **I1 — Comment drift on Throttler timing** — `apps/api/src/app.module.ts:68` says throttler arrives "in M8"; plan.md M3b §3b.7 says it lands in 3b.7. Update the comment when wiring `AuthController`.
- **I2 — CSRF surface remains nil** — Bearer-only auth, no cookies. Confirmed clean.

---

## Security-review skill findings

The built-in `security-review` skill ran in parallel against the same diff. After false-positive filtering, it produced one finding — **the same H1 timing oracle**, with confidence 9/10. A second candidate (differential error messages in `refresh()`) was investigated and dropped as defense-in-depth without a concrete exploit path: an attacker who already holds a stolen refresh token gains no new capability from the message-text difference; tokens are 48-byte CSPRNG-derived so the unknown-token branch carries no enumeration value.

No additional findings beyond the milestone-auditor's H1.

---

## Verdict

**CLEAN — proceed to 3b.7.**

All audit items above were already addressed in three fix-up commits on this branch prior to this checkpoint write-up:

- `4eed763 fix(api): M3b audit — bcrypt timing oracle in validateCredentials (H1, L1)` — adds `dummyPasswordHash` precomputed in `onModuleInit` at the configured salt rounds; `validateCredentials` always calls `passwordService.compare` (against `user.password` if present, else the dummy hash) before any 401; dead `user.deletedAt` branch removed.
- `2fc0765 fix(api): M3b audit — atomic refresh-token rotation transaction (H2)` — new-row insert + old-row revoke wrapped in `refreshTokenRepo.manager.transaction`. Return shape unchanged.
- `a92c4d1 fix(api): M3b audit — pino redaction, silent revocation, comment drift (M1, L2, I1)` — adds `*.access_token`, `*.tokenHash`, `*.lookupHash`, `*.token_hash`, `*.lookup_hash` to pino redact paths; wraps `revokeFamilyById` in try/catch with `ErrorReporter.captureException` on failure (still throws 401); updates `app.module.ts:68` comment to reference 3b.7.

Verification: `pnpm --filter api typecheck`, `lint`, and `test` all pass (88 unit tests, including new H1 missing-user/null-password assertions, H2 atomicity assertion, and L2 silent-revocation assertion).

3b.7 (AuthController + throttler) may proceed.
