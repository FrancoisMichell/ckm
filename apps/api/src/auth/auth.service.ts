import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHash, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { UserRoleType } from '@ckm/contracts';
import { UsersService } from '../users/users.service';
import { PasswordService } from '../common/utils/password.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { UserPayload } from './interfaces/user-payload.interface';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

/**
 * AuthService handles credential validation, token issuance, refresh rotation,
 * and logout. It is the single source of truth for the auth data layer.
 *
 * Methods are implemented across sub-steps:
 *  - 3b.3: validateCredentials (used by LocalStrategy)
 *  - 3b.5: login
 *  - 3b.6: refresh, logout
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Credential validation (3b.3)
  // ---------------------------------------------------------------------------

  /**
   * Validates registry + password credentials.
   *
   * Rules (per docs/api/04-auth-and-rbac.md):
   * - 401 if no user with that registry.
   * - 401 if user has no password set.
   * - 401 if bcrypt comparison fails.
   * - 401 if user has no TEACHER role.
   * - 401 if user is soft-deleted.
   *
   * Returns the UserPayload on success; throws UnauthorizedException on failure.
   */
  async validateCredentials(
    registry: string,
    password: string,
  ): Promise<UserPayload> {
    const user = await this.usersService.findByRegistry(registry);

    if (!user || !user.password || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const passwordMatch = await this.passwordService.compare(
      password,
      user.password,
    );
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const hasTeacherRole = user.roles.some(
      (r) => r.role === UserRoleType.TEACHER,
    );
    if (!hasTeacherRole) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return {
      id: user.id,
      registry: user.registry ?? '',
      name: user.name,
      roles: user.roles.map((r) => r.role),
    };
  }

  // ---------------------------------------------------------------------------
  // Login (3b.5)
  // ---------------------------------------------------------------------------

  /**
   * Issues an access JWT and a fresh refresh token for a validated user.
   *
   * Steps:
   * 1. Sign 15-minute access JWT with sub, username, name, roles.
   * 2. Generate an opaque refresh token (crypto.randomBytes(48).toString('base64url')).
   * 3. Compute SHA-256 lookup_hash for fast DB lookup.
   * 4. bcrypt-hash the raw token for tamper-proof storage.
   * 5. Persist a new RefreshToken row with a fresh family_id.
   * 6. Return the plaintext tokens (the hash stays in the DB only).
   */
  async login(user: UserPayload): Promise<AuthTokens> {
    const accessToken = this.signAccessToken(user);

    const rawRefreshToken = randomBytes(48).toString('base64url');
    const lookupHash = this.sha256(rawRefreshToken);
    const tokenHash = await this.hashRefreshToken(rawRefreshToken);

    const refreshTtlDays = this.configService.getOrThrow<number>(
      'jwt.refreshTtlDays',
    );
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + refreshTtlDays);

    const row = this.refreshTokenRepo.create({
      userId: user.id,
      tokenHash,
      lookupHash,
      familyId: randomUUID(),
      replacedBy: null,
      revoked: false,
      expiresAt,
    });

    await this.refreshTokenRepo.save(row);

    return {
      access_token: accessToken,
      refresh_token: rawRefreshToken,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers (also used in 3b.6)
  // ---------------------------------------------------------------------------

  private signAccessToken(user: UserPayload): string {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.registry,
      name: user.name,
      roles: user.roles,
    };
    return this.jwtService.sign(payload);
  }

  /**
   * SHA-256 hex digest of a value — used as the fast lookup key for a
   * refresh token row. Does not provide bcrypt timing-safe security on its
   * own; bcrypt comparison on the found row is the authoritative check.
   */
  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async hashRefreshToken(raw: string): Promise<string> {
    const rounds = this.configService.getOrThrow<number>(
      'security.bcryptSaltRounds',
    );
    return bcrypt.hash(raw, rounds);
  }
}
