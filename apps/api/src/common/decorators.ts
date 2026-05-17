import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { UserRoleType } from './enums';
import { RequestWithUser } from './interfaces/request-with-user.interface';

/**
 * Mark a route as public (bypass JwtAuthGuard).
 * Usage: @Public() on a controller method or class.
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Require one or more roles to access a route.
 * Always apply at controller class level, not per-method.
 * Usage: @Roles(UserRoleType.TEACHER)
 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRoleType[]) =>
  SetMetadata(ROLES_KEY, roles);

/**
 * Inject the currently-authenticated user from the request.
 * Usage: @CurrentUser() user: User
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
