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
  // Refresh rotation (3b.6)
  // ---------------------------------------------------------------------------

  /**
   * Rotates a refresh token:
   * 1. Look up the row by lookup_hash (finds both revoked and active rows).
   * 2. Not found → 401.
   * 3. Found but revoked → REPLAY DETECTED: revoke every row in the family → 401.
   * 4. Found and not revoked: mark old row revoked + replaced_by = new row id,
   *    issue a new token in the same family.
   *
   * bcrypt-verify is performed as a belt-and-suspenders guard against SHA-256
   * collisions (astronomically unlikely but the cost is negligible on a single row).
   */
  async refresh(rawToken: string): Promise<AuthTokens> {
    const lookupHash = this.sha256(rawToken);

    const existingRow = await this.refreshTokenRepo.findOne({
      where: { lookupHash },
    });

    if (!existingRow) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    // Belt-and-suspenders bcrypt verification
    const hashMatches = await bcrypt.compare(rawToken, existingRow.tokenHash);
    if (!hashMatches) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    // Replay detection: token was already consumed — revoke the entire family.
    if (existingRow.revoked) {
      await this.revokeFamilyById(existingRow.familyId);
      throw new UnauthorizedException(
        'Refresh token reuse detected. All sessions revoked.',
      );
    }

    // Check expiry
    if (existingRow.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired.');
    }

    // Rotate: build the new token first so we can set replaced_by on the old row.
    const rawNewToken = randomBytes(48).toString('base64url');
    const newLookupHash = this.sha256(rawNewToken);
    const newTokenHash = await this.hashRefreshToken(rawNewToken);

    const refreshTtlDays = this.configService.getOrThrow<number>(
      'jwt.refreshTtlDays',
    );
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + refreshTtlDays);

    const newRow = this.refreshTokenRepo.create({
      userId: existingRow.userId,
      tokenHash: newTokenHash,
      lookupHash: newLookupHash,
      familyId: existingRow.familyId, // same family
      replacedBy: null,
      revoked: false,
      expiresAt,
    });

    const savedNewRow = await this.refreshTokenRepo.save(newRow);

    // Mark the old row consumed
    await this.refreshTokenRepo.update(existingRow.id, {
      revoked: true,
      replacedBy: savedNewRow.id,
    });

    // Issue new access token — load the user to get current roles snapshot
    const user = await this.usersService.findById(existingRow.userId);
    if (!user) {
      throw new UnauthorizedException('User no longer exists.');
    }

    const userPayload: UserPayload = {
      id: user.id,
      registry: user.registry ?? '',
      name: user.name,
      roles: user.roles.map((r) => r.role),
    };

    return {
      access_token: this.signAccessToken(userPayload),
      refresh_token: rawNewToken,
    };
  }

  // ---------------------------------------------------------------------------
  // Logout (3b.6)
  // ---------------------------------------------------------------------------

  /**
   * Revokes a single refresh token (single-device logout).
   * Does not revoke the whole family — that only happens on replay.
   */
  async logout(rawToken: string): Promise<void> {
    const lookupHash = this.sha256(rawToken);

    const row = await this.refreshTokenRepo.findOne({
      where: { lookupHash },
    });

    if (!row) {
      // Token not found — treat as already logged out (idempotent).
      return;
    }

    await this.refreshTokenRepo.update(row.id, { revoked: true });
  }

  // ---------------------------------------------------------------------------
  // Family revocation helper
  // ---------------------------------------------------------------------------

  /**
   * Revokes every non-revoked row sharing the given family_id.
   * Called on replay detection to neutralise a potentially stolen family.
   */
  private async revokeFamilyById(familyId: string): Promise<void> {
    await this.refreshTokenRepo
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revoked: true })
      .where('family_id = :familyId AND revoked = false', { familyId })
      .execute();
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
