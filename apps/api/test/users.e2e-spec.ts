/**
 * E2E tests for UsersService / constraint map.
 *
 * Runs against postgres-test (port 5433, DB ckm_test).
 * The DB-name guard ensures we never wipe a non-test DB.
 *
 * Run with: pnpm --filter api test:e2e
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, QueryFailedError } from 'typeorm';
import { Belt, UserRoleType } from '@ckm/contracts';
import { createTestApp } from './app.e2e-helper';
import { UsersService } from '@/users/users.service';
import { QueryFailedErrorFilter } from '@/common/filters/query-failed-error.filter';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let usersService: UsersService;

  beforeAll(async () => {
    // DB-name guard — refuse to wipe a non-test DB
    const dbName = process.env['DB_NAME'];
    if (!dbName?.endsWith('_test')) {
      throw new Error(
        `Refusing to run e2e against non-test DB: "${dbName}". DB_NAME must end with "_test".`,
      );
    }

    ({ app, ds } = await createTestApp());
    usersService = app.get(UsersService);

    // Apply migrations to the test DB (idempotent)
    await ds.runMigrations();
  }, 60_000); // 60s timeout for app boot + migrations

  afterEach(async () => {
    // Cascade delete via users table (user_roles FK has ON DELETE CASCADE)
    await ds.query('DELETE FROM "users"');
  });

  afterAll(async () => {
    await ds.query('DELETE FROM "users"');
    await app.close();
  }, 15_000);

  // -------------------------------------------------------------------------
  // 1. CRUD — create and findById
  // -------------------------------------------------------------------------

  describe('CRUD', () => {
    it('should create a user and return correct shape', async () => {
      const user = await usersService.create(
        {
          name: 'Alice Teacher',
          registry: 'T001',
          password: 'secret',
          belt: Belt.BLACK,
        },
        [UserRoleType.TEACHER],
      );

      expect(user).toBeDefined();
      expect(user!.name).toBe('Alice Teacher');
      expect(user!.registry).toBe('T001');
      expect(user!.belt).toBe(Belt.BLACK);
      expect(user!.roles).toHaveLength(1);
      expect(user!.roles[0].role).toBe(UserRoleType.TEACHER);
    });

    it('findById should load roles and instructor relation', async () => {
      const created = await usersService.create(
        { name: 'Bob Student', registry: 'S001', belt: Belt.WHITE },
        [UserRoleType.STUDENT],
      );

      const found = await usersService.findById(created!.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created!.id);
      expect(found!.roles).toHaveLength(1);
      expect(found!.instructor).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Duplicate registry constraint → mapped to 409 by QueryFailedErrorFilter
  // -------------------------------------------------------------------------

  describe('duplicate registry constraint', () => {
    it('should throw QueryFailedError on duplicate registry insert', async () => {
      await usersService.create(
        { name: 'First User', registry: 'DUP001', belt: Belt.WHITE },
        [UserRoleType.STUDENT],
      );

      // Second insert violates uq_users_registry — should throw
      await expect(
        ds.query(
          `INSERT INTO users (name, registry, belt) VALUES ('Second User', 'DUP001', 'white')`,
        ),
      ).rejects.toThrow();
    });

    it('constraint map: uq_users_registry_active → 409 application/problem+json', () => {
      const filter = new QueryFailedErrorFilter({
        captureException: () => {},
      } as any);

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        type: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;
      const mockReq = { url: '/test' } as any;
      const host = {
        switchToHttp: () => ({
          getResponse: () => mockRes,
          getRequest: () => mockReq,
        }),
      } as any;

      const err = new QueryFailedError('', [], {
        constraint: 'uq_users_registry_active',
        message: 'duplicate',
      } as any);

      filter.catch(err, host);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.type).toHaveBeenCalledWith('application/problem+json');
      const jsonArg = (mockRes.json as jest.Mock).mock.calls[0][0] as any;
      expect(jsonArg.title).toBe('Registry already in use');
      expect(jsonArg.status).toBe(409);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Soft-delete: created user hidden after softDelete
  // -------------------------------------------------------------------------

  describe('soft-delete', () => {
    it('should hide soft-deleted user from default findById', async () => {
      const user = await usersService.create(
        { name: 'Delete Me', registry: 'DEL001', belt: Belt.WHITE },
        [UserRoleType.STUDENT],
      );

      await usersService.softDelete(user!.id);

      const found = await usersService.findById(user!.id);
      expect(found).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Restore: soft-deleted user visible again after restore
  // -------------------------------------------------------------------------

  describe('restore', () => {
    it('should make a soft-deleted user visible again after restore', async () => {
      const user = await usersService.create(
        { name: 'Restore Me', registry: 'RES001', belt: Belt.BLUE },
        [UserRoleType.STUDENT],
      );

      await usersService.softDelete(user!.id);
      expect(await usersService.findById(user!.id)).toBeNull();

      await usersService.restore(user!.id);
      const restored = await usersService.findById(user!.id);
      expect(restored).toBeDefined();
      expect(restored!.id).toBe(user!.id);
    });
  });

  // -------------------------------------------------------------------------
  // 5. findByRole with belt filter
  // -------------------------------------------------------------------------

  describe('findByRole with belt filter', () => {
    it('should return only white-belt students when filtering by WHITE belt', async () => {
      await usersService.create(
        { name: 'White Student 1', registry: 'W001', belt: Belt.WHITE },
        [UserRoleType.STUDENT],
      );
      await usersService.create(
        { name: 'White Student 2', registry: 'W002', belt: Belt.WHITE },
        [UserRoleType.STUDENT],
      );
      await usersService.create(
        { name: 'Blue Student', registry: 'B001', belt: Belt.BLUE },
        [UserRoleType.STUDENT],
      );

      const result = await usersService.findByRole(UserRoleType.STUDENT, {
        belts: [Belt.WHITE],
      } as any);

      expect(result.total).toBe(2);
      expect(result.data.every((u) => u.belt === Belt.WHITE)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Belt-rank sort: white → blue → black order
  // -------------------------------------------------------------------------

  describe('belt-rank sort', () => {
    it('should return users sorted by belt rank ASC (white < blue < black)', async () => {
      await usersService.create(
        { name: 'Black Belt', registry: 'BLK001', belt: Belt.BLACK },
        [UserRoleType.STUDENT],
      );
      await usersService.create(
        { name: 'Blue Belt', registry: 'BLU001', belt: Belt.BLUE },
        [UserRoleType.STUDENT],
      );
      await usersService.create(
        { name: 'White Belt', registry: 'WHT001', belt: Belt.WHITE },
        [UserRoleType.STUDENT],
      );

      const result = await usersService.findByRole(UserRoleType.STUDENT, {
        sortBy: 'belt',
        sortOrder: 'ASC',
      } as any);

      expect(result.data).toHaveLength(3);
      const belts = result.data.map((u) => u.belt);
      expect(belts[0]).toBe(Belt.WHITE);
      expect(belts[1]).toBe(Belt.BLUE);
      expect(belts[2]).toBe(Belt.BLACK);
    });
  });

  // -------------------------------------------------------------------------
  // 7. HTTP layer: app is running (reachable via supertest)
  // -------------------------------------------------------------------------

  describe('HTTP response shape', () => {
    it('app responds to HTTP requests (not a connection refused)', async () => {
      const response = await request(app.getHttpServer()).get('/nonexistent');
      // Should get 404 not a connection error — confirms the app is alive.
      expect(response.status).toBeGreaterThan(0);
    });
  });
});
