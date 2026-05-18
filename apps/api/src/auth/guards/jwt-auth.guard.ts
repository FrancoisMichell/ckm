import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../common/decorators';

/**
 * Global JWT guard. Registered as APP_GUARD in AuthModule so every route is
 * protected by default. Routes decorated with @Public() skip the JWT check.
 *
 * Registration happens in AppModule.providers (added in 3b.4) using APP_GUARD
 * so that NestJS's DI system can inject Reflector into the guard.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check the handler and controller class for @Public() metadata.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
