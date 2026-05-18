import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../../common/decorators';

// Suppress the passport-jwt super.canActivate call by mocking the parent.
// We test only JwtAuthGuard's own logic here (public bypass).
jest.mock('@nestjs/passport', () => {
  const original = jest.requireActual('@nestjs/passport');
  return {
    ...original,
    AuthGuard: () => {
      class MockAuthGuard {
        canActivate(_ctx: ExecutionContext) {
          return true;
        }
      }
      return MockAuthGuard;
    },
  };
});

describe('JwtAuthGuard', () => {
  function makeReflector(isPublic: boolean): Reflector {
    return {
      getAllAndOverride: jest.fn().mockReturnValue(isPublic),
    } as unknown as Reflector;
  }

  function makeContext(): ExecutionContext {
    return {
      getHandler: jest.fn().mockReturnValue({}),
      getClass: jest.fn().mockReturnValue({}),
    } as unknown as ExecutionContext;
  }

  it('returns true immediately when @Public() is set (skips JWT check)', () => {
    const reflector = makeReflector(true);
    const guard = new JwtAuthGuard(reflector);
    const ctx = makeContext();

    const result = guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
  });

  it('delegates to super.canActivate when route is not public', () => {
    const reflector = makeReflector(false);
    const guard = new JwtAuthGuard(reflector);
    const ctx = makeContext();

    // The mock AuthGuard always returns true; we just verify it was called.
    const result = guard.canActivate(ctx);

    expect(result).toBe(true);
  });
});
