# 04 — Auth & RBAC

## Token model

| Token         | Lifetime | Storage                                    | Carries                                                                                    |
| ------------- | -------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Access token  | 15 min   | Stateless JWT                              | `sub` (user id), `username` (registry), `roles[]`, standard `iat` / `exp`. Signed with `JWT_SECRET` (HS256). |
| Refresh token | 30 days  | Opaque random string; bcrypt-hashed in DB  | None — looked up by hash in `refresh_tokens`.                                              |

Both are issued by `POST /auth/login`. Refresh is rotated on every `POST /auth/refresh` (one-time-use). If a token is presented after it's been consumed, the entire **family** (`family_id` on `refresh_tokens`) is revoked — this catches replay attacks.

Generate refresh tokens with `crypto.randomBytes(48).toString('base64url')`. Never store the raw token; only `bcrypt(token)`.

## Login flow (`POST /auth/login`)

1. **Public** route. Rate-limited to 5 / 60s.
2. `LocalAuthGuard` (passport-local) runs `AuthService.validateCredentials(registry, password)`:
   - `usersRepository.findOne({ where: { registry }, relations: ['roles'] })`.
   - 401 if no user, no password set, or `bcrypt.compare` fails.
   - 401 if user has no `TEACHER` role.
   - 401 if user is soft-deleted (`deletedAt IS NOT NULL`).
3. On success, `AuthService.login(user)`:
   - Sign access token: `{ sub, username, roles }`, `expiresIn: '15m'`.
   - Mint refresh token (random + bcrypt + insert into `refresh_tokens` with new `family_id`).
   - Return `{ accessToken, refreshToken, user }`.

## Refresh flow (`POST /auth/refresh`)

1. **Public**.
2. Body: `{ refreshToken }`.
3. Service walks every non-revoked, non-expired row for the user's tokens (in practice, narrow by hashing prefix or store a lookup key) and finds the one whose hash matches via `bcrypt.compare`.
4. If found and unconsumed: rotate.
   - Mark old row `revoked_at = now()`, `replaced_by = newRow.id`.
   - Insert new row with same `family_id`.
   - Return fresh access + refresh.
5. If found but already revoked: family compromise. Revoke every non-revoked row in that `family_id`. Return 401.
6. If not found: 401.

## Logout flow (`POST /auth/logout`)

1. JWT-protected.
2. Body: `{ refreshToken }`.
3. Mark the matching row `revoked_at = now()`. Do not revoke the whole family — single device.

## Guards (applied globally in order)

1. **`JwtAuthGuard`** — extends `AuthGuard('jwt')`. Skips when `@Public()` metadata is present.
2. **`RolesGuard`** — reads `@Roles()` metadata. Skips when `@Public()`. Returns true if intersection of required roles and `request.user.roles` is non-empty.
3. **`ThrottlerGuard`** — global default `{ ttl: 60_000, limit: 100 }`. Not registered when `NODE_ENV === 'test'`. Override per-route with `@Throttle({ default: { limit, ttl } })`. Skip with `@SkipThrottle()`.

Wire in `AppModule.providers` via `APP_GUARD`. Order matters: Jwt → Roles → Throttler.

## Strategies

### `JwtStrategy` (`passport-jwt`)

```ts
super({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  ignoreExpiration: false,
  secretOrKey: config.getOrThrow('JWT_SECRET'),  // NO fallback — must be set
});

validate(payload) {
  return { id: payload.sub, registry: payload.username, roles: payload.roles ?? [] };
}
```

> The v1 code hardcoded `'your_jwt_secret_key'`. v2 reads `JWT_SECRET` via `ConfigService.getOrThrow` and Joi requires it. Don't ship a fallback.

### `LocalStrategy` (`passport-local`)

Username field is `registry`. Delegates to `AuthService.validateCredentials`.

## Decorators (`src/common/decorators.ts`)

```ts
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRoleType[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data, ctx) => ctx.switchToHttp().getRequest<RequestWithUser>().user,
);
```

`request.user` is `{ id, registry, roles }` — derived from the JWT payload, NOT a full `User` entity. If a handler needs the entity, hit the repository with `currentUser.id`.

## RBAC matrix (v1)

| Endpoint group        | Required role | Notes                                                  |
| --------------------- | ------------- | ------------------------------------------------------ |
| `/auth/login`         | none (Public) | Rate-limited 5/60s                                     |
| `/auth/refresh`       | none (Public) |                                                        |
| `/auth/logout`        | JWT, any role |                                                        |
| `/auth/me`            | JWT, any role |                                                        |
| `/health`             | none (Public) |                                                        |
| All other endpoints   | `TEACHER`     | Controllers carry `@Roles(UserRoleType.TEACHER)` at the class level |

Student-facing endpoints are not exposed in v1. The `STUDENT` role exists in the schema so future v2 features (student self-service portal) don't require a migration.

## Data isolation

Multi-tenancy is per-teacher, enforced in services:

- `StudentsService.findAll(query, currentTeacherId)` filters `WHERE user.instructor_id = :currentTeacherId`.
- `ClassesService.findAll(_, currentTeacherId)` filters `WHERE class.teacher_id = :currentTeacherId`.
- `ClassSessionsService` and `AttendancesService` join through `class.teacher_id` to filter.

This is the **single most important security invariant**. The bootstrap checklist includes an e2e test suite that verifies teacher A cannot list / read / mutate teacher B's data — write it before shipping.
