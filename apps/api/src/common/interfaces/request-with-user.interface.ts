import { Request } from 'express';

/**
 * Augmented request type that carries the authenticated user after
 * JwtAuthGuard or LocalAuthGuard populates req.user.
 *
 * The User type is referenced as a loose shape here to avoid a
 * circular import from the users module. Feature modules that need
 * the full User entity can cast or use the UserEntity type directly.
 */
export interface AuthenticatedUser {
  id: string;
  registry: string;
  name: string;
  roles: string[];
}

export interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}
