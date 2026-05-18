import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRoleType } from '@ckm/contracts';
import { UsersService } from '../users/users.service';
import { PasswordService } from '../common/utils/password.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { UserPayload } from './interfaces/user-payload.interface';

/**
 * AuthService handles credential validation, token issuance, refresh rotation,
 * and logout. It is the single source of truth for the auth data layer.
 *
 * Methods are implemented incrementally across sub-steps:
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
  ) {}

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
}
