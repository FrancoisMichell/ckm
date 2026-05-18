import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../../common/decorators';
import { UserRoleType } from '@ckm/contracts';

describe('RolesGuard', () => {
  function makeReflector(opts: {
    isPublic?: boolean;
    roles?: string[];
  }): Reflector {
    return {
      getAllAndOverride: jest.fn().mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return opts.isPublic ?? false;
        if (key === ROLES_KEY) return opts.roles ?? undefined;
        return undefined;
      }),
    } as unknown as Reflector;
  }

  function makeContext(userRoles: string[]): ExecutionContext {
    return {
      getHandler: jest.fn().mockReturnValue({}),
      getClass: jest.fn().mockReturnValue({}),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { id: 'uid', registry: 'REG', name: 'Name', roles: userRoles },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('returns true for @Public() routes without checking roles', () => {
    const reflector = makeReflector({ isPublic: true });
    const guard = new RolesGuard(reflector);
    const ctx = makeContext([]);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('returns true when no @Roles() metadata is present (any authenticated user)', () => {
    const reflector = makeReflector({ isPublic: false, roles: undefined });
    const guard = new RolesGuard(reflector);
    const ctx = makeContext([UserRoleType.STUDENT]);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('returns true when user has the required role', () => {
    const reflector = makeReflector({
      isPublic: false,
      roles: [UserRoleType.TEACHER],
    });
    const guard = new RolesGuard(reflector);
    const ctx = makeContext([UserRoleType.TEACHER]);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('returns false when user does not have the required role', () => {
    const reflector = makeReflector({
      isPublic: false,
      roles: [UserRoleType.TEACHER],
    });
    const guard = new RolesGuard(reflector);
    const ctx = makeContext([UserRoleType.STUDENT]);

    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('returns false when user has no roles at all', () => {
    const reflector = makeReflector({
      isPublic: false,
      roles: [UserRoleType.TEACHER],
    });
    const guard = new RolesGuard(reflector);
    const ctx = makeContext([]);

    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('returns false when request.user is missing', () => {
    const reflector = makeReflector({
      isPublic: false,
      roles: [UserRoleType.TEACHER],
    });
    const guard = new RolesGuard(reflector);
    const ctx = {
      getHandler: jest.fn().mockReturnValue({}),
      getClass: jest.fn().mockReturnValue({}),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user: undefined }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(false);
  });
});
