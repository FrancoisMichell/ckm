import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Get,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from '../common/decorators';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { AuthService, AuthTokens } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UserPayload } from './interfaces/user-payload.interface';
import { RequestWithUser } from '../common/interfaces/request-with-user.interface';

/**
 * Authentication endpoints.
 *
 * Surface (per docs/api/04-auth-and-rbac.md):
 *  - POST /auth/login   — Public, rate-limited 5/60s, registry + password.
 *  - POST /auth/refresh — Public, rotates refresh token; replay revokes family.
 *  - POST /auth/logout  — JWT-protected, single-device revocation.
 *  - GET  /auth/me      — JWT-protected, echoes the current user payload.
 *
 * Notes:
 *  - The `LoginDto` exists purely so global ValidationPipe rejects requests
 *    missing `registry` / `password` with a 422 problem+json before they reach
 *    LocalAuthGuard. The actual credential read happens inside LocalStrategy
 *    via `usernameField: 'registry'`, not from the `@Body() body: LoginDto`.
 *  - `@Public()` skips JwtAuthGuard. `@Roles()` is intentionally omitted from
 *    /auth/me and /auth/logout — any authenticated role may call them.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ---------------------------------------------------------------------------
  // POST /auth/login — issue access + refresh tokens
  // ---------------------------------------------------------------------------

  /**
   * Validates credentials via LocalAuthGuard → LocalStrategy →
   * AuthService.validateCredentials. On success Passport attaches the
   * UserPayload to `req.user`; we then mint tokens via AuthService.login.
   *
   * Rate-limited to 5 requests per 60 seconds (per IP) via @Throttle override
   * on top of the global ThrottlerModule default (100/60s).
   */
  @Public()
  @UseGuards(LocalAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Request() req: RequestWithUser,
    // Body is referenced only so ValidationPipe runs before LocalAuthGuard
    // bails with a generic 401 on a malformed payload. The validated DTO is
    // not consumed here — LocalStrategy reads registry/password from the raw
    // request body via passport-local's `usernameField` mechanism.
    @Body() _body: LoginDto,
  ): Promise<AuthTokens> {
    return this.authService.login(req.user as UserPayload);
  }

  // ---------------------------------------------------------------------------
  // POST /auth/refresh — rotate refresh token
  // ---------------------------------------------------------------------------

  /**
   * Public route — refresh tokens authenticate themselves via the hash lookup
   * in AuthService.refresh. Presenting a previously-rotated token revokes the
   * entire family and returns 401.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() body: RefreshTokenDto): Promise<AuthTokens> {
    return this.authService.refresh(body.refresh_token);
  }

  // ---------------------------------------------------------------------------
  // POST /auth/logout — single-device revocation
  // ---------------------------------------------------------------------------

  /**
   * Revokes the supplied refresh token only. Does not invalidate the bearer
   * access token (stateless JWTs cannot be revoked server-side before expiry —
   * the 15-minute TTL is the bound).
   *
   * Idempotent: an unknown token returns 204 without error so a client can
   * retry without checking the previous response.
   */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Body() body: RefreshTokenDto): Promise<void> {
    await this.authService.logout(body.refresh_token);
  }

  // ---------------------------------------------------------------------------
  // GET /auth/me — current user payload from the JWT
  // ---------------------------------------------------------------------------

  /**
   * Returns the JWT-derived user payload (id, registry, name, roles). Does NOT
   * hit the database — controllers needing fresh entity data should query the
   * repository with `currentUser.id`.
   */
  @Get('me')
  me(@CurrentUser() user: UserPayload): UserPayload {
    return user;
  }
}
