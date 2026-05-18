import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { UsersService } from '../users/users.service';
import { PasswordService } from '../common/utils/password.service';
import { UserRoleType } from '@ckm/contracts';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/entities/user-role.entity';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<User> = {}): User {
  const role = Object.assign(new UserRole(), { role: UserRoleType.TEACHER });
  return Object.assign(new User(), {
    id: 'user-id-1',
    name: 'Prof Test',
    registry: 'PROF001',
    password: '$2b$10$hashedpassword',
    deletedAt: null,
    roles: [role],
    ...overrides,
  });
}

function makeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  const defaults: Record<string, unknown> = {
    'jwt.secret': 'test-secret-at-least-32-chars-long!!',
    'jwt.refreshTtlDays': 30,
    'security.bcryptSaltRounds': 4, // low rounds for test speed
    ...overrides,
  };
  return {
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (key in defaults) return defaults[key];
      throw new Error(`Config key "${key}" not found`);
    }),
  } as unknown as ConfigService;
}

function makeJwtService(): jest.Mocked<JwtService> {
  return {
    sign: jest.fn().mockReturnValue('signed.access.token'),
  } as unknown as jest.Mocked<JwtService>;
}

function makePasswordService(): jest.Mocked<PasswordService> {
  return {
    compare: jest.fn(),
    hashPassword: jest.fn(),
  } as unknown as jest.Mocked<PasswordService>;
}

function makeUsersService(user: User | null): jest.Mocked<Pick<UsersService, 'findByRegistry'>> {
  return {
    findByRegistry: jest.fn().mockResolvedValue(user),
  };
}

/** Builds a Repository<RefreshToken> mock that captures save() arguments. */
function makeTokenRepo(): {
  repo: jest.Mocked<Pick<Repository<RefreshToken>, 'create' | 'save' | 'find' | 'update'>>;
  saved: RefreshToken[];
} {
  const saved: RefreshToken[] = [];
  const repo = {
    create: jest.fn().mockImplementation((data: Partial<RefreshToken>) => {
      return Object.assign(new RefreshToken(), { id: 'token-row-id', ...data });
    }),
    save: jest.fn().mockImplementation(async (entity: RefreshToken) => {
      saved.push(entity);
      return entity;
    }),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  return { repo, saved };
}

function buildService(opts: {
  user?: User | null;
  configOverrides?: Record<string, unknown>;
}) {
  const user = opts.user !== undefined ? opts.user : makeUser();
  const { repo, saved } = makeTokenRepo();
  const usersService = makeUsersService(user);
  const jwtService = makeJwtService();
  const passwordService = makePasswordService();
  const configService = makeConfigService(opts.configOverrides);

  const service = new AuthService(
    repo as unknown as Repository<RefreshToken>,
    usersService as unknown as UsersService,
    jwtService,
    passwordService,
    configService,
  );

  return { service, repo, saved, usersService, jwtService, passwordService, configService };
}

// ---------------------------------------------------------------------------
// validateCredentials
// ---------------------------------------------------------------------------

describe('AuthService.validateCredentials', () => {
  it('returns UserPayload for a valid teacher with matching password', async () => {
    const user = makeUser();
    const { service, passwordService } = buildService({ user });
    (passwordService.compare as jest.Mock).mockResolvedValue(true);

    const result = await service.validateCredentials('PROF001', 'password123');

    expect(result).toEqual({
      id: 'user-id-1',
      registry: 'PROF001',
      name: 'Prof Test',
      roles: [UserRoleType.TEACHER],
    });
  });

  it('throws UnauthorizedException when user not found', async () => {
    const { service } = buildService({ user: null });

    await expect(
      service.validateCredentials('UNKNOWN', 'anything'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when password does not match', async () => {
    const user = makeUser();
    const { service, passwordService } = buildService({ user });
    (passwordService.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.validateCredentials('PROF001', 'wrong'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when user is soft-deleted', async () => {
    const user = makeUser({ deletedAt: new Date() });
    const { service } = buildService({ user });

    await expect(
      service.validateCredentials('PROF001', 'password123'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when user has no TEACHER role', async () => {
    const studentRole = Object.assign(new UserRole(), { role: UserRoleType.STUDENT });
    const user = makeUser({ roles: [studentRole] });
    const { service, passwordService } = buildService({ user });
    (passwordService.compare as jest.Mock).mockResolvedValue(true);

    await expect(
      service.validateCredentials('PROF001', 'password123'),
    ).rejects.toThrow(UnauthorizedException);
  });
});

// ---------------------------------------------------------------------------
// login — 3b.5 assertions
// ---------------------------------------------------------------------------

describe('AuthService.login', () => {
  const userPayload = {
    id: 'user-id-1',
    registry: 'PROF001',
    name: 'Prof Test',
    roles: [UserRoleType.TEACHER],
  };

  it('returns access_token and refresh_token', async () => {
    const { service } = buildService({});
    const result = await service.login(userPayload);

    expect(result.access_token).toBe('signed.access.token');
    expect(typeof result.refresh_token).toBe('string');
    expect(result.refresh_token.length).toBeGreaterThan(0);
  });

  it('persists a RefreshToken row with family_id set (not null/undefined)', async () => {
    const { service, saved } = buildService({});

    await service.login(userPayload);

    expect(saved).toHaveLength(1);
    const row = saved[0];
    expect(row.familyId).toBeDefined();
    expect(row.familyId).not.toBeNull();
    expect(typeof row.familyId).toBe('string');
    // Should be a valid UUID pattern
    expect(row.familyId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('stores a bcrypt hash — tokenHash is NOT equal to the plaintext token', async () => {
    const { service, saved } = buildService({});

    const result = await service.login(userPayload);
    const row = saved[0];

    // The plaintext token must differ from what is stored
    expect(row.tokenHash).not.toBe(result.refresh_token);

    // The stored hash must be a valid bcrypt digest
    const isValid = await bcrypt.compare(result.refresh_token, row.tokenHash);
    expect(isValid).toBe(true);
  });

  it('stores a SHA-256 lookup_hash that matches sha256(rawToken)', async () => {
    const { service, saved } = buildService({});

    const result = await service.login(userPayload);
    const row = saved[0];

    const expectedLookup = service.sha256(result.refresh_token);
    expect(row.lookupHash).toBe(expectedLookup);
  });

  it('sets revoked=false on the new row', async () => {
    const { service, saved } = buildService({});

    await service.login(userPayload);

    expect(saved[0].revoked).toBe(false);
  });

  it('sets expires_at in the future', async () => {
    const { service, saved } = buildService({});

    await service.login(userPayload);

    expect(saved[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

// ---------------------------------------------------------------------------
// Helpers for refresh / logout tests (3b.6)
// ---------------------------------------------------------------------------

/**
 * Builds a RefreshToken row with a real bcrypt hash so that the service's
 * bcrypt.compare() call succeeds. Uses salt rounds=4 for test speed.
 */
async function makeActiveTokenRow(
  rawToken: string,
  familyId: string,
  overrides: Partial<RefreshToken> = {},
): Promise<RefreshToken> {
  const tokenHash = await bcrypt.hash(rawToken, 4);
  const lookupHash = require('crypto')
    .createHash('sha256')
    .update(rawToken)
    .digest('hex');

  return Object.assign(new RefreshToken(), {
    id: 'token-row-id',
    userId: 'user-id-1',
    tokenHash,
    lookupHash,
    familyId,
    replacedBy: null,
    revoked: false,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    ...overrides,
  });
}

/**
 * Builds a complete service with a fully-controllable repository mock
 * suitable for refresh and logout tests.
 */
function buildRefreshService(opts: {
  existingRow: RefreshToken | null;
  familyRows?: RefreshToken[];
}) {
  const { existingRow, familyRows = [] } = opts;

  // Track update calls so we can assert on them
  const updateCalls: Array<{ id: string; patch: Partial<RefreshToken> }> = [];
  const savedRows: RefreshToken[] = [];
  const qbUpdates: Array<{ familyId: string }> = [];

  const qbMock = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockImplementation((_q: string, params: { familyId: string }) => {
      qbUpdates.push({ familyId: params.familyId });
      return qbMock;
    }),
    execute: jest.fn().mockResolvedValue({ affected: familyRows.length }),
  };

  const repo = {
    findOne: jest.fn().mockImplementation(async ({ where }: { where: { lookupHash?: string } }) => {
      if (!existingRow) return null;
      if (where.lookupHash && existingRow.lookupHash === where.lookupHash) {
        return existingRow;
      }
      return null;
    }),
    create: jest.fn().mockImplementation((data: Partial<RefreshToken>) => {
      return Object.assign(new RefreshToken(), { id: 'new-token-row-id', ...data });
    }),
    save: jest.fn().mockImplementation(async (entity: RefreshToken) => {
      savedRows.push(entity);
      return entity;
    }),
    update: jest.fn().mockImplementation(async (id: string, patch: Partial<RefreshToken>) => {
      updateCalls.push({ id, patch });
      return { affected: 1 };
    }),
    createQueryBuilder: jest.fn().mockReturnValue(qbMock),
    find: jest.fn().mockResolvedValue(familyRows),
  };

  const user = makeUser();
  const usersService = {
    findByRegistry: jest.fn().mockResolvedValue(user),
    findById: jest.fn().mockResolvedValue(user),
  };
  const jwtService = makeJwtService();
  const passwordService = makePasswordService();
  const configService = makeConfigService();

  const service = new AuthService(
    repo as unknown as Repository<RefreshToken>,
    usersService as unknown as UsersService,
    jwtService,
    passwordService,
    configService,
  );

  return { service, repo, savedRows, updateCalls, qbUpdates, usersService };
}

// ---------------------------------------------------------------------------
// AuthService.refresh — 3b.6 assertions
// ---------------------------------------------------------------------------

describe('AuthService.refresh', () => {
  const RAW_TOKEN = 'test-raw-refresh-token-opaque-string';
  const FAMILY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  it('throws UnauthorizedException when no matching row is found', async () => {
    const { service } = buildRefreshService({ existingRow: null });

    await expect(service.refresh(RAW_TOKEN)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('returns new tokens when presented with a valid unconsumed token', async () => {
    const existingRow = await makeActiveTokenRow(RAW_TOKEN, FAMILY_ID);
    const { service } = buildRefreshService({ existingRow });

    const result = await service.refresh(RAW_TOKEN);

    expect(result.access_token).toBe('signed.access.token');
    expect(typeof result.refresh_token).toBe('string');
    expect(result.refresh_token).not.toBe(RAW_TOKEN);
  });

  it('marks the old row revoked and sets replaced_by on rotation', async () => {
    const existingRow = await makeActiveTokenRow(RAW_TOKEN, FAMILY_ID);
    const { service, updateCalls } = buildRefreshService({ existingRow });

    await service.refresh(RAW_TOKEN);

    // Should have called update on the old row id
    const oldRowUpdate = updateCalls.find((c) => c.id === 'token-row-id');
    expect(oldRowUpdate).toBeDefined();
    expect(oldRowUpdate?.patch.revoked).toBe(true);
    expect(oldRowUpdate?.patch.replacedBy).toBe('new-token-row-id');
  });

  it('new token row shares the same family_id as the consumed row', async () => {
    const existingRow = await makeActiveTokenRow(RAW_TOKEN, FAMILY_ID);
    const { service, savedRows } = buildRefreshService({ existingRow });

    await service.refresh(RAW_TOKEN);

    expect(savedRows).toHaveLength(1);
    expect(savedRows[0].familyId).toBe(FAMILY_ID);
  });

  it('REPLAY: throws UnauthorizedException when token is already revoked', async () => {
    const revokedRow = await makeActiveTokenRow(RAW_TOKEN, FAMILY_ID, {
      revoked: true,
    });
    const { service } = buildRefreshService({ existingRow: revokedRow });

    await expect(service.refresh(RAW_TOKEN)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('REPLAY: revokes all rows sharing family_id when a consumed token is replayed', async () => {
    const revokedRow = await makeActiveTokenRow(RAW_TOKEN, FAMILY_ID, {
      revoked: true,
    });
    const siblingRow = await makeActiveTokenRow('sibling-token', FAMILY_ID);
    const { service, qbUpdates } = buildRefreshService({
      existingRow: revokedRow,
      familyRows: [revokedRow, siblingRow],
    });

    await expect(service.refresh(RAW_TOKEN)).rejects.toThrow(
      UnauthorizedException,
    );

    // The query builder should have been used to revoke the family
    expect(qbUpdates).toHaveLength(1);
    expect(qbUpdates[0].familyId).toBe(FAMILY_ID);
  });
});

// ---------------------------------------------------------------------------
// AuthService.logout — 3b.6 assertions
// ---------------------------------------------------------------------------

describe('AuthService.logout', () => {
  const RAW_TOKEN = 'logout-test-token';
  const FAMILY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  it('marks the matching row as revoked', async () => {
    const existingRow = await makeActiveTokenRow(RAW_TOKEN, FAMILY_ID);
    const { service, updateCalls } = buildRefreshService({ existingRow });

    await service.logout(RAW_TOKEN);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].id).toBe('token-row-id');
    expect(updateCalls[0].patch.revoked).toBe(true);
  });

  it('is idempotent — does not throw when token is not found', async () => {
    const { service } = buildRefreshService({ existingRow: null });

    await expect(service.logout(RAW_TOKEN)).resolves.toBeUndefined();
  });

  it('after logout, refresh on the same token throws UnauthorizedException', async () => {
    // Start with an active token
    const existingRow = await makeActiveTokenRow(RAW_TOKEN, FAMILY_ID);

    // After logout the row is revoked — simulate by returning revoked row for refresh
    const revokedRow = Object.assign({}, existingRow, { revoked: true });

    const { service: logoutService } = buildRefreshService({ existingRow });
    await logoutService.logout(RAW_TOKEN);

    // Now simulate a refresh attempt against the revoked row
    const { service: refreshService } = buildRefreshService({
      existingRow: revokedRow,
    });
    await expect(refreshService.refresh(RAW_TOKEN)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
