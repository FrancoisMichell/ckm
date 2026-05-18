/**
 * Shape of the JWT access token payload.
 * sub      = user UUID
 * username = academy login ID (the registry field; named "username" to follow
 *            the passport-local convention and the seirin v1 contract)
 * name     = user display name
 * roles    = snapshot of the user's roles at login time
 */
export interface JwtPayload {
  sub: string;
  username: string;
  name: string;
  roles: string[];
  iat?: number;
  exp?: number;
}
