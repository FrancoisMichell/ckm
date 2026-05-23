/**
 * E2E tests for the classes surface (M5 §5.6).
 *
 * Runs against postgres-test (port 5433, DB ckm_test).
 * Gates covered (per docs/plan.md §5.6):
 *   - CRUD: POST, GET list, GET one, PATCH, DELETE (soft), POST :id/restore.
 *   - Enrollment: POST :id/enrollments, DELETE :id/enrollments/:studentId,
 *     GET :id/enrollments.
 *   - Enrollment dedupe: re-enroll after soft-delete → restores (201 not 409).
 *   - Enrollment conflict: double-enroll while active → 409 Conflict.
 *   - Soft-delete + restore on class.
 *   - Teacher-isolation: cross-teacher access returns 404 (never 403).
 *   - chk_classes_duration: durationMinutes outside 30–300 → 422.
 *
 * Run with: pnpm --filter api test:e2e -- --testPathPattern=classes
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
    'THROTTLE_TEST_BYPASS_TOKEN must be set in .env.test for the classes e2e suite.',
  );
}
const SKIP_THROTTLE = { 'x-test-skip-throttle': BYPASS_TOKEN } as const;

describe('Classes (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let usersService: UsersService;

  let counter = 0;
  const nextRegistry = (prefix = 'C'): string =>
    `${prefix}${String(++counter).padStart(5, '0')}`;

  /** Create a TEACHER user and return auth token. */
  async function seedTeacherAndLogin(): Promise<{
    id: string;
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

    return { id: user.id, accessToken: login.body.access_token as string };
  }

  /** Create a STUDENT under a given teacher and return the student id. */
  async function seedStudent(teacherToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/students')
      .set(SKIP_THROTTLE)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: `Student ${nextRegistry('S')}`, registry: nextRegistry(), belt: Belt.WHITE });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  /** Minimal valid class payload. */
  const validClass = () => ({
    name: 'Turma Iniciante',
    days: ['monday', 'wednesday'],
    startTime: '07:30',
    durationMinutes: 60,
    belt: Belt.WHITE,
  });

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
    // Delete in dependency order to satisfy FK constraints.
    await ds.query('DELETE FROM "class_enrollments"');
    await ds.query('DELETE FROM "classes"');
    await ds.query('DELETE FROM "refresh_tokens"');
    await ds.query('DELETE FROM "users"');
  });

  afterAll(async () => {
    await ds.query('DELETE FROM "class_enrollments"');
    await ds.query('DELETE FROM "classes"');
    await ds.query('DELETE FROM "refresh_tokens"');
    await ds.query('DELETE FROM "users"');
    await app.close();
  }, 15_000);

  // -------------------------------------------------------------------------
  // Class CRUD
  // -------------------------------------------------------------------------

  describe('Class CRUD', () => {
    it('POST /classes creates a class and returns 201', async () => {
      const teacher = await seedTeacherAndLogin();

      const res = await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send(validClass());

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Turma Iniciante');
      expect(res.body.days).toEqual(['monday', 'wednesday']);
      expect(res.body.startTime).toBe('07:30');
      expect(res.body.durationMinutes).toBe(60);
      expect(res.body.belt).toBe(Belt.WHITE);
      expect(res.body.teacherId).toBe(teacher.id);
      // Soft-delete field must not leak.
      expect(JSON.stringify(res.body)).not.toMatch(/"deletedAt"/);
    });

    it('POST /classes rejects durationMinutes=29 with 422 (chk_classes_duration)', async () => {
      const teacher = await seedTeacherAndLogin();

      const res = await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ ...validClass(), durationMinutes: 29 });

      // class-validator Min(30) fires before the DB → 422 from ValidationPipe.
      expect(res.status).toBe(422);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it('POST /classes rejects durationMinutes=301 with 422', async () => {
      const teacher = await seedTeacherAndLogin();

      const res = await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ ...validClass(), durationMinutes: 301 });

      expect(res.status).toBe(422);
    });

    it('POST /classes rejects invalid day-of-week value with 422', async () => {
      const teacher = await seedTeacherAndLogin();

      const res = await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ ...validClass(), days: ['invalidday'] });

      expect(res.status).toBe(422);
    });

    it('GET /classes returns all classes owned by the teacher', async () => {
      const teacher = await seedTeacherAndLogin();
      const auth = `Bearer ${teacher.accessToken}`;

      // Create two classes
      await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send({ ...validClass(), name: 'Turma A' });
      await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send({ ...validClass(), name: 'Turma B' });

      const res = await request(app.getHttpServer())
        .get('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', auth);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });

    it('GET /classes/:id returns 404 for unknown id', async () => {
      const teacher = await seedTeacherAndLogin();

      const res = await request(app.getHttpServer())
        .get('/classes/00000000-0000-4000-8000-000000000000')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it('PATCH /classes/:id updates a class', async () => {
      const teacher = await seedTeacherAndLogin();
      const auth = `Bearer ${teacher.accessToken}`;

      const created = await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send(validClass());
      expect(created.status).toBe(201);

      const res = await request(app.getHttpServer())
        .patch(`/classes/${created.body.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send({ name: 'Turma Avancada', durationMinutes: 90 });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Turma Avancada');
      expect(res.body.durationMinutes).toBe(90);
    });

    it('DELETE /classes/:id soft-deletes; GET then returns 404', async () => {
      const teacher = await seedTeacherAndLogin();
      const auth = `Bearer ${teacher.accessToken}`;

      const created = await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send(validClass());
      expect(created.status).toBe(201);

      const del = await request(app.getHttpServer())
        .delete(`/classes/${created.body.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth);
      expect(del.status).toBe(204);

      // Default GET must miss the soft-deleted row.
      const after = await request(app.getHttpServer())
        .get(`/classes/${created.body.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth);
      expect(after.status).toBe(404);

      // Row must remain in DB with deleted_at set.
      const rows = (await ds.query(
        `SELECT deleted_at FROM classes WHERE id = $1`,
        [created.body.id],
      )) as { deleted_at: Date | null }[];
      expect(rows).toHaveLength(1);
      expect(rows[0].deleted_at).not.toBeNull();
    });

    it('POST /classes/:id/restore brings back a soft-deleted class', async () => {
      const teacher = await seedTeacherAndLogin();
      const auth = `Bearer ${teacher.accessToken}`;

      const created = await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send(validClass());

      await request(app.getHttpServer())
        .delete(`/classes/${created.body.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth);

      const restore = await request(app.getHttpServer())
        .post(`/classes/${created.body.id}/restore`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth);
      expect(restore.status).toBe(204);

      const res = await request(app.getHttpServer())
        .get(`/classes/${created.body.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Turma Iniciante');
    });
  });

  // -------------------------------------------------------------------------
  // Enrollment CRUD + dedupe
  // -------------------------------------------------------------------------

  describe('Enrollments', () => {
    it('POST /classes/:id/enrollments creates an enrollment (201)', async () => {
      const teacher = await seedTeacherAndLogin();
      const auth = `Bearer ${teacher.accessToken}`;

      const studentId = await seedStudent(teacher.accessToken);

      const cls = await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send(validClass());
      expect(cls.status).toBe(201);

      const res = await request(app.getHttpServer())
        .post(`/classes/${cls.body.id}/enrollments`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send({ studentId });

      expect(res.status).toBe(201);
      expect(res.body.classId).toBe(cls.body.id);
      expect(res.body.userId).toBe(studentId);
    });

    it('POST /classes/:id/enrollments returns 409 when student already actively enrolled', async () => {
      const teacher = await seedTeacherAndLogin();
      const auth = `Bearer ${teacher.accessToken}`;

      const studentId = await seedStudent(teacher.accessToken);

      const cls = await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send(validClass());

      // First enrollment succeeds.
      await request(app.getHttpServer())
        .post(`/classes/${cls.body.id}/enrollments`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send({ studentId });

      // Second enrollment while first is active → 409.
      const res = await request(app.getHttpServer())
        .post(`/classes/${cls.body.id}/enrollments`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send({ studentId });

      expect(res.status).toBe(409);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it('Re-enrolling after unenroll restores the enrollment (201, not 409)', async () => {
      const teacher = await seedTeacherAndLogin();
      const auth = `Bearer ${teacher.accessToken}`;

      const studentId = await seedStudent(teacher.accessToken);

      const cls = await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send(validClass());

      // Enroll.
      await request(app.getHttpServer())
        .post(`/classes/${cls.body.id}/enrollments`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send({ studentId });

      // Unenroll (soft-delete).
      const unenroll = await request(app.getHttpServer())
        .delete(`/classes/${cls.body.id}/enrollments/${studentId}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth);
      expect(unenroll.status).toBe(204);

      // DB: row soft-deleted.
      const afterUnenroll = (await ds.query(
        `SELECT deleted_at FROM class_enrollments WHERE class_id = $1 AND user_id = $2`,
        [cls.body.id, studentId],
      )) as { deleted_at: Date | null }[];
      expect(afterUnenroll[0].deleted_at).not.toBeNull();

      // Re-enroll → should restore (201) not error.
      const reEnroll = await request(app.getHttpServer())
        .post(`/classes/${cls.body.id}/enrollments`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send({ studentId });
      expect(reEnroll.status).toBe(201);

      // DB: row restored (deleted_at IS NULL).
      const afterRestore = (await ds.query(
        `SELECT deleted_at FROM class_enrollments WHERE class_id = $1 AND user_id = $2`,
        [cls.body.id, studentId],
      )) as { deleted_at: Date | null }[];
      expect(afterRestore[0].deleted_at).toBeNull();
    });

    it('DELETE /classes/:id/enrollments/:studentId soft-deletes enrollment', async () => {
      const teacher = await seedTeacherAndLogin();
      const auth = `Bearer ${teacher.accessToken}`;

      const studentId = await seedStudent(teacher.accessToken);

      const cls = await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send(validClass());

      await request(app.getHttpServer())
        .post(`/classes/${cls.body.id}/enrollments`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send({ studentId });

      const del = await request(app.getHttpServer())
        .delete(`/classes/${cls.body.id}/enrollments/${studentId}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth);
      expect(del.status).toBe(204);

      // Row must remain with deleted_at set.
      const rows = (await ds.query(
        `SELECT deleted_at FROM class_enrollments WHERE class_id = $1 AND user_id = $2`,
        [cls.body.id, studentId],
      )) as { deleted_at: Date | null }[];
      expect(rows).toHaveLength(1);
      expect(rows[0].deleted_at).not.toBeNull();
    });

    it('GET /classes/:id/enrollments lists active enrollments', async () => {
      const teacher = await seedTeacherAndLogin();
      const auth = `Bearer ${teacher.accessToken}`;

      const studentA = await seedStudent(teacher.accessToken);
      const studentB = await seedStudent(teacher.accessToken);

      const cls = await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send(validClass());

      await request(app.getHttpServer())
        .post(`/classes/${cls.body.id}/enrollments`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send({ studentId: studentA });
      await request(app.getHttpServer())
        .post(`/classes/${cls.body.id}/enrollments`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send({ studentId: studentB });

      const res = await request(app.getHttpServer())
        .get(`/classes/${cls.body.id}/enrollments`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      // Soft-deleted field must not leak.
      expect(JSON.stringify(res.body)).not.toMatch(/"deletedAt"/);
    });

    it('GET /classes/:id/enrollments hides soft-deleted enrollments', async () => {
      const teacher = await seedTeacherAndLogin();
      const auth = `Bearer ${teacher.accessToken}`;

      const studentId = await seedStudent(teacher.accessToken);

      const cls = await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send(validClass());

      await request(app.getHttpServer())
        .post(`/classes/${cls.body.id}/enrollments`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth)
        .send({ studentId });

      await request(app.getHttpServer())
        .delete(`/classes/${cls.body.id}/enrollments/${studentId}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth);

      const res = await request(app.getHttpServer())
        .get(`/classes/${cls.body.id}/enrollments`)
        .set(SKIP_THROTTLE)
        .set('Authorization', auth);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    it('POST /classes/:id/enrollments returns 404 when student belongs to another teacher', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      // Student owned by teacherA
      const studentId = await seedStudent(teacherA.accessToken);

      // Class owned by teacherB
      const cls = await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`)
        .send(validClass());

      // teacherB tries to enroll teacherA's student → 404 (not 403)
      const res = await request(app.getHttpServer())
        .post(`/classes/${cls.body.id}/enrollments`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`)
        .send({ studentId });

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Teacher-isolation (404 not 403)
  // -------------------------------------------------------------------------

  describe('Teacher-isolation (404 not 403)', () => {
    it('GET /classes returns ONLY classes owned by the calling teacher', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`)
        .send({ ...validClass(), name: 'Turma A' });
      await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`)
        .send({ ...validClass(), name: 'Turma B' });

      const aList = await request(app.getHttpServer())
        .get('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`);
      const bList = await request(app.getHttpServer())
        .get('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);

      expect(aList.body).toHaveLength(1);
      expect(bList.body).toHaveLength(1);
      expect(aList.body[0].name).toBe('Turma A');
      expect(bList.body[0].name).toBe('Turma B');
    });

    it('GET /classes/:id returns 404 (not 403) when class belongs to another teacher', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const cls = await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`)
        .send(validClass());

      const res = await request(app.getHttpServer())
        .get(`/classes/${cls.body.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it('PATCH /classes/:id returns 404 (not 403) when class belongs to another teacher', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const cls = await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`)
        .send(validClass());

      const res = await request(app.getHttpServer())
        .patch(`/classes/${cls.body.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`)
        .send({ name: 'hijack' });

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);

      // Verify the row was NOT mutated.
      const rows = (await ds.query(
        `SELECT name FROM classes WHERE id = $1`,
        [cls.body.id],
      )) as { name: string }[];
      expect(rows[0].name).toBe('Turma Iniciante');
    });

    it('DELETE /classes/:id returns 404 (not 403) when class belongs to another teacher', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const cls = await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`)
        .send(validClass());

      const res = await request(app.getHttpServer())
        .delete(`/classes/${cls.body.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);

      // Row must still be live.
      const rows = (await ds.query(
        `SELECT deleted_at FROM classes WHERE id = $1`,
        [cls.body.id],
      )) as { deleted_at: Date | null }[];
      expect(rows[0].deleted_at).toBeNull();
    });

    it('GET /classes/:id/enrollments returns 404 when class belongs to another teacher', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const cls = await request(app.getHttpServer())
        .post('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`)
        .send(validClass());

      const res = await request(app.getHttpServer())
        .get(`/classes/${cls.body.id}/enrollments`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);

      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // RBAC: STUDENT-only users must not access /classes
  // -------------------------------------------------------------------------

  describe('RBAC', () => {
    it('GET /classes returns 403 when the JWT carries only the STUDENT role', async () => {
      const registry = nextRegistry('STD');
      const password = 'student-password-123';
      const student = await usersService.create(
        { name: `Student ${registry}`, registry, password, belt: Belt.WHITE },
        [UserRoleType.STUDENT],
      );
      if (!student) throw new Error('Failed to seed STUDENT');

      const { JwtService } = await import('@nestjs/jwt');
      const jwt = app.get(JwtService);
      const token = jwt.sign({
        sub: student.id,
        username: registry,
        roles: [UserRoleType.STUDENT],
      });

      const res = await request(app.getHttpServer())
        .get('/classes')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });
});
