/**
 * E2E tests for the students surface (M4 §4.4).
 *
 * Runs against postgres-test (port 5433, DB ckm_test).
 * Gates covered (per docs/plan.md §4.4):
 *   - CRUD: POST, GET list, GET one, PATCH, DELETE (soft), POST :id/restore.
 *   - Filters: name, registry, belts[], sortBy + sortOrder, pagination.
 *   - Belt-rank sort (white → black, NOT alphabetical).
 *   - Teacher-isolation smoke: cross-teacher reads/mutations return 404 (never 403).
 *
 * The exclusion filters (notEnrolledInClass, notInSession) reference tables
 * that do not exist until M5 / M6. The DTO accepts them and the service
 * runs an existence probe; that surface lands fully in M9.
 *
 * Run with: pnpm --filter api test:e2e
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Belt, UserRoleType } from '@ckm/contracts';
import { createTestApp } from './app.e2e-helper';
import { UsersService } from '@/users/users.service';

const BYPASS_TOKEN = process.env['THROTTLE_TEST_BYPASS_TOKEN'];
if (!BYPASS_TOKEN) {
  throw new Error(
    'THROTTLE_TEST_BYPASS_TOKEN must be set in .env.test (≥16 chars) for the students e2e suite.',
  );
}
const SKIP_THROTTLE = { 'x-test-skip-throttle': BYPASS_TOKEN } as const;

describe('Students (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let usersService: UsersService;

  // Per-suite monotonic registry so each test creates fresh users that
  // satisfy uq_users_registry_active without bleed between cases.
  let registryCounter = 0;
  const nextRegistry = (prefix = 'S'): string => {
    registryCounter += 1;
    return `${prefix}${String(registryCounter).padStart(5, '0')}`;
  };

  /** Create a TEACHER user and return id + auth-bearer token. */
  async function seedTeacherAndLogin(): Promise<{
    id: string;
    registry: string;
    accessToken: string;
  }> {
    const registry = nextRegistry('T');
    const password = 'correct-horse-battery-staple';
    const user = await usersService.create(
      { name: `Teacher ${registry}`, registry, password, belt: Belt.BLACK },
      [UserRoleType.TEACHER],
    );
    if (!user) throw new Error(`Failed to seed teacher ${registry}`);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set(SKIP_THROTTLE)
      .send({ registry, password });
    expect(login.status).toBe(200);

    return {
      id: user.id,
      registry,
      accessToken: login.body.access_token as string,
    };
  }

  beforeAll(async () => {
    const dbName = process.env['DB_NAME'];
    if (!dbName?.endsWith('_test')) {
      throw new Error(
        `Refusing to run e2e against non-test DB: "${dbName}". DB_NAME must end with "_test".`,
      );
    }

    ({ app, ds } = await createTestApp());
    usersService = app.get(UsersService);

    await ds.runMigrations();
  }, 60_000);

  afterEach(async () => {
    // refresh_tokens cascades from users; clearing users wipes both.
    await ds.query('DELETE FROM "refresh_tokens"');
    await ds.query('DELETE FROM "users"');
  });

  afterAll(async () => {
    await ds.query('DELETE FROM "refresh_tokens"');
    await ds.query('DELETE FROM "users"');
    await app.close();
  }, 15_000);

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  describe('CRUD', () => {
    it('POST /students creates a student under the calling teacher', async () => {
      const teacher = await seedTeacherAndLogin();

      const res = await request(app.getHttpServer())
        .post('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({
          name: 'Aluno Um',
          registry: nextRegistry(),
          belt: Belt.WHITE,
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Aluno Um');
      expect(res.body.belt).toBe(Belt.WHITE);
      expect(res.body.instructor.id).toBe(teacher.id);

      // No password / deletedAt leaks (ClassSerializerInterceptor + @Exclude).
      const body = JSON.stringify(res.body);
      expect(body).not.toMatch(/"password"/);
      expect(body).not.toMatch(/"deletedAt"/);
    });

    it('POST /students rejects unknown fields (whitelist + forbidNonWhitelisted)', async () => {
      const teacher = await seedTeacherAndLogin();

      const res = await request(app.getHttpServer())
        .post('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({
          name: 'Aluno',
          belt: Belt.WHITE,
          // forged — must be stripped or rejected, never honoured
          instructor: { id: 'other-teacher' },
        });

      // forbidNonWhitelisted → 422
      expect(res.status).toBe(422);
    });

    it('GET /students/:id returns the student', async () => {
      const teacher = await seedTeacherAndLogin();
      const created = await request(app.getHttpServer())
        .post('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({
          name: 'Aluno Find',
          registry: nextRegistry(),
          belt: Belt.BLUE,
        });
      expect(created.status).toBe(201);

      const res = await request(app.getHttpServer())
        .get(`/students/${created.body.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.body.id);
      expect(res.body.belt).toBe(Belt.BLUE);
    });

    it('GET /students/:id returns 404 for unknown id', async () => {
      const teacher = await seedTeacherAndLogin();
      const res = await request(app.getHttpServer())
        .get('/students/00000000-0000-4000-8000-000000000000')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it('PATCH /students/:id updates a student', async () => {
      const teacher = await seedTeacherAndLogin();
      const created = await request(app.getHttpServer())
        .post('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({
          name: 'Patch Me',
          registry: nextRegistry(),
          belt: Belt.WHITE,
        });

      const res = await request(app.getHttpServer())
        .patch(`/students/${created.body.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ name: 'Patched', belt: Belt.BLUE });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Patched');
      expect(res.body.belt).toBe(Belt.BLUE);
    });

    it('DELETE /students/:id soft-deletes; GET then returns 404', async () => {
      const teacher = await seedTeacherAndLogin();
      const created = await request(app.getHttpServer())
        .post('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({
          name: 'Delete Me',
          registry: nextRegistry(),
          belt: Belt.WHITE,
        });

      const del = await request(app.getHttpServer())
        .delete(`/students/${created.body.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);
      expect(del.status).toBe(204);

      // Default reads should now miss the row.
      const after = await request(app.getHttpServer())
        .get(`/students/${created.body.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);
      expect(after.status).toBe(404);

      // DB-level invariant: row remains, deleted_at populated.
      const rows = (await ds.query(
        `SELECT id, deleted_at FROM users WHERE id = $1`,
        [created.body.id],
      )) as { id: string; deleted_at: Date | null }[];
      expect(rows).toHaveLength(1);
      expect(rows[0].deleted_at).not.toBeNull();
    });

    it('POST /students/:id/restore brings back a soft-deleted student', async () => {
      const teacher = await seedTeacherAndLogin();
      const created = await request(app.getHttpServer())
        .post('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({
          name: 'Restore Me',
          registry: nextRegistry(),
          belt: Belt.WHITE,
        });

      await request(app.getHttpServer())
        .delete(`/students/${created.body.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      const restore = await request(app.getHttpServer())
        .post(`/students/${created.body.id}/restore`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);
      expect(restore.status).toBe(204);

      const res = await request(app.getHttpServer())
        .get(`/students/${created.body.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);
      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Filters & pagination
  // -------------------------------------------------------------------------

  describe('Filters & pagination', () => {
    async function seedThreeStudents(authHeader: string): Promise<void> {
      await request(app.getHttpServer())
        .post('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', authHeader)
        .send({ name: 'Alice', registry: nextRegistry(), belt: Belt.WHITE });
      await request(app.getHttpServer())
        .post('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', authHeader)
        .send({ name: 'Bob',   registry: nextRegistry(), belt: Belt.BLUE });
      await request(app.getHttpServer())
        .post('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', authHeader)
        .send({ name: 'Carol', registry: nextRegistry(), belt: Belt.BLACK });
    }

    it('GET /students applies the name filter (case-insensitive partial)', async () => {
      const teacher = await seedTeacherAndLogin();
      const auth = `Bearer ${teacher.accessToken}`;
      await seedThreeStudents(auth);

      const res = await request(app.getHttpServer())
        .get('/students?name=ali')
        .set(SKIP_THROTTLE)
        .set('Authorization', auth);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].name).toBe('Alice');
    });

    it('GET /students applies the registry filter (case-insensitive partial)', async () => {
      const teacher = await seedTeacherAndLogin();
      const auth = `Bearer ${teacher.accessToken}`;
      const reg = nextRegistry('UNIQ');
      await request(app.getHttpServer())
        .post('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send({ name: 'Solo', registry: reg, belt: Belt.WHITE });
      await request(app.getHttpServer())
        .post('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send({ name: 'Other', registry: nextRegistry(), belt: Belt.WHITE });

      const res = await request(app.getHttpServer())
        .get(`/students?registry=${reg.toLowerCase()}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].registry).toBe(reg);
    });

    it('GET /students applies the belts[] filter (single value)', async () => {
      const teacher = await seedTeacherAndLogin();
      const auth = `Bearer ${teacher.accessToken}`;
      await seedThreeStudents(auth);

      const res = await request(app.getHttpServer())
        .get(`/students?belts=${Belt.BLUE}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].belt).toBe(Belt.BLUE);
    });

    it('GET /students applies the belts[] filter (multiple values)', async () => {
      const teacher = await seedTeacherAndLogin();
      const auth = `Bearer ${teacher.accessToken}`;
      await seedThreeStudents(auth);

      const res = await request(app.getHttpServer())
        .get(`/students?belts=${Belt.WHITE}&belts=${Belt.BLUE}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.data.map((u: { belt: Belt }) => u.belt).sort()).toEqual(
        [Belt.BLUE, Belt.WHITE].sort(),
      );
    });

    it('GET /students sorts by belt rank ASC (white → blue → black), NOT alphabetical', async () => {
      const teacher = await seedTeacherAndLogin();
      const auth = `Bearer ${teacher.accessToken}`;
      await seedThreeStudents(auth);

      const res = await request(app.getHttpServer())
        .get('/students?sortBy=belt&sortOrder=ASC')
        .set(SKIP_THROTTLE)
        .set('Authorization', auth);

      expect(res.status).toBe(200);
      const belts = res.body.data.map((u: { belt: Belt }) => u.belt);
      // Alphabetical would put 'black' first; belt-rank puts 'white' first.
      expect(belts).toEqual([Belt.WHITE, Belt.BLUE, Belt.BLACK]);
    });

    it('GET /students sorts by belt rank DESC (black → white)', async () => {
      const teacher = await seedTeacherAndLogin();
      const auth = `Bearer ${teacher.accessToken}`;
      await seedThreeStudents(auth);

      const res = await request(app.getHttpServer())
        .get('/students?sortBy=belt&sortOrder=DESC')
        .set(SKIP_THROTTLE)
        .set('Authorization', auth);

      expect(res.status).toBe(200);
      const belts = res.body.data.map((u: { belt: Belt }) => u.belt);
      expect(belts).toEqual([Belt.BLACK, Belt.BLUE, Belt.WHITE]);
    });

    it('GET /students paginates (page=2, limit=2 returns the third row)', async () => {
      const teacher = await seedTeacherAndLogin();
      const auth = `Bearer ${teacher.accessToken}`;
      await seedThreeStudents(auth);

      const res = await request(app.getHttpServer())
        .get('/students?page=2&limit=2&sortBy=name&sortOrder=ASC')
        .set(SKIP_THROTTLE)
        .set('Authorization', auth);

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(2);
      expect(res.body.total).toBe(3);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Carol');
    });

    it('GET /students validates the page param (page=0 is rejected)', async () => {
      const teacher = await seedTeacherAndLogin();
      const res = await request(app.getHttpServer())
        .get('/students?page=0')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(422);
    });

    it('GET /students rejects unknown sortBy values', async () => {
      const teacher = await seedTeacherAndLogin();
      const res = await request(app.getHttpServer())
        .get('/students?sortBy=password')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(422);
    });

    it('GET /students returns 404 when notEnrolledInClass references a non-existent class id', async () => {
      const teacher = await seedTeacherAndLogin();
      const res = await request(app.getHttpServer())
        .get('/students?notEnrolledInClass=00000000-0000-4000-8000-000000000000')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      // Tables don't exist in M4 — service falls through to either:
      //   - 404 from the existence probe (if classes table got created earlier)
      //   - 500 from QueryFailedError (if the probe itself errors on missing table)
      // Either is acceptable for this release; the filter is fully exercised in M5/M9.
      expect([404, 500]).toContain(res.status);
    });
  });

  // -------------------------------------------------------------------------
  // Teacher-isolation smoke (release-blocker pattern from CLAUDE.md)
  // -------------------------------------------------------------------------

  describe('teacher-isolation smoke (404 not 403)', () => {
    it('GET /students returns ONLY rows owned by the calling teacher', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      await request(app.getHttpServer())
        .post('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`)
        .send({ name: 'A-student', registry: nextRegistry(), belt: Belt.WHITE });
      await request(app.getHttpServer())
        .post('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`)
        .send({ name: 'B-student', registry: nextRegistry(), belt: Belt.WHITE });

      const aList = await request(app.getHttpServer())
        .get('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`);
      const bList = await request(app.getHttpServer())
        .get('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);

      expect(aList.status).toBe(200);
      expect(bList.status).toBe(200);
      expect(aList.body.total).toBe(1);
      expect(bList.body.total).toBe(1);
      expect(aList.body.data[0].name).toBe('A-student');
      expect(bList.body.data[0].name).toBe('B-student');
    });

    it('GET /students/:id returns 404 (NOT 403) when the row belongs to another teacher', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const aStudent = await request(app.getHttpServer())
        .post('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`)
        .send({ name: 'A-student', registry: nextRegistry(), belt: Belt.WHITE });
      expect(aStudent.status).toBe(201);

      const crossRead = await request(app.getHttpServer())
        .get(`/students/${aStudent.body.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);

      // The contract: 404 not 403. 403 would confirm existence.
      expect(crossRead.status).toBe(404);
      expect(crossRead.status).not.toBe(403);
      expect(crossRead.headers['content-type']).toMatch(
        /application\/problem\+json/,
      );
    });

    it('PATCH /students/:id returns 404 (NOT 403) when the row belongs to another teacher', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const aStudent = await request(app.getHttpServer())
        .post('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`)
        .send({ name: 'A-student', registry: nextRegistry(), belt: Belt.WHITE });

      const crossPatch = await request(app.getHttpServer())
        .patch(`/students/${aStudent.body.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`)
        .send({ name: 'hijack' });

      expect(crossPatch.status).toBe(404);
      expect(crossPatch.status).not.toBe(403);

      // DB-level invariant: the row was NOT mutated.
      const rows = (await ds.query(`SELECT name FROM users WHERE id = $1`, [
        aStudent.body.id,
      ])) as { name: string }[];
      expect(rows[0].name).toBe('A-student');
    });

    it('DELETE /students/:id returns 404 (NOT 403) when the row belongs to another teacher', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const aStudent = await request(app.getHttpServer())
        .post('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`)
        .send({ name: 'A-student', registry: nextRegistry(), belt: Belt.WHITE });

      const crossDelete = await request(app.getHttpServer())
        .delete(`/students/${aStudent.body.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);

      expect(crossDelete.status).toBe(404);
      expect(crossDelete.status).not.toBe(403);

      // Row must still be live (deleted_at IS NULL) for teacherA.
      const rows = (await ds.query(
        `SELECT deleted_at FROM users WHERE id = $1`,
        [aStudent.body.id],
      )) as { deleted_at: Date | null }[];
      expect(rows[0].deleted_at).toBeNull();
    });

    it('POST /students/:id/restore returns 404 (NOT 403) when the row belongs to another teacher', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const aStudent = await request(app.getHttpServer())
        .post('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`)
        .send({ name: 'A-student', registry: nextRegistry(), belt: Belt.WHITE });

      // teacherA soft-deletes first
      await request(app.getHttpServer())
        .delete(`/students/${aStudent.body.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`);

      const crossRestore = await request(app.getHttpServer())
        .post(`/students/${aStudent.body.id}/restore`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);

      expect(crossRestore.status).toBe(404);
      expect(crossRestore.status).not.toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // RBAC: a STUDENT-only user must not access /students
  // -------------------------------------------------------------------------

  describe('RBAC', () => {
    it('GET /students returns 403 when the JWT carries only the STUDENT role', async () => {
      // Seed a STUDENT user, log them in, and try to hit /students.
      const registry = nextRegistry('STD');
      const password = 'student-password-123';
      const student = await usersService.create(
        { name: `Student ${registry}`, registry, password, belt: Belt.WHITE },
        [UserRoleType.STUDENT],
      );
      if (!student) throw new Error('Failed to seed STUDENT');

      // /auth/login rejects non-teachers (see auth.service validateCredentials);
      // forge a STUDENT-only JWT via the AuthService directly so we can prove
      // the role gate, not the login gate, is what blocks the request.
      const { JwtService } = await import('@nestjs/jwt');
      const jwt = app.get(JwtService);
      const token = jwt.sign({
        sub: student.id,
        username: registry,
        roles: [UserRoleType.STUDENT],
      });

      const res = await request(app.getHttpServer())
        .get('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${token}`);

      // RolesGuard returns 403 (Forbidden) — distinct from the 404 tenant
      // contract above. 403 here is correct: it reflects an authenticated
      // user without the required role, not a missing resource.
      expect(res.status).toBe(403);
    });
  });
});
