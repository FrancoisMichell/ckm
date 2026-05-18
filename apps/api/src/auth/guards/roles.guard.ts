import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../../common/decorators';
import { RequestWithUser } from '../../common/interfaces/request-with-user.interface';

/**
 * Checks that the authenticated user holds at least one of the roles
 * declared via @Roles(...) on the controller class or route handler.
 *
 * Skips when:
 * - @Public() is present (route requires no auth at all).
 * - No @Roles() metadata is declared (any authenticated user is allowed).
 *
 * Returns false (403) when the user's role list does not intersect with
 * the required roles.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Public routes bypass role checking entirely.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() declared — any authenticated user is allowed.
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    // JwtAuthGuard runs first in the global guard chain, so user is always
    // present here for non-public routes. Guard against missing user anyway.
    if (!user) return false;

    return requiredRoles.some((role) => user.roles.includes(role));
  }
}
