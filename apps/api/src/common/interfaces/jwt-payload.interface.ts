/**
 * Shape of the JWT access token payload.
 * sub = user UUID, registry = academy login ID.
 * roles is a snapshot at login time.
 */
export interface JwtPayload {
  sub: string;
  registry: string;
  roles: string[];
  iat?: number;
  exp?: number;
}
