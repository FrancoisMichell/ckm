/**
 * The reduced user shape that flows through the auth layer.
 *
 * This is what JwtStrategy.validate() returns, what LocalStrategy
 * attaches to request.user, and what AuthService.login() receives.
 * It intentionally does NOT carry the full User entity (no password,
 * no deletedAt) — controllers that need the full entity must hit the
 * repository directly via currentUser.id.
 */
export interface UserPayload {
  id: string;
  registry: string;
  name: string;
  roles: string[];
}
