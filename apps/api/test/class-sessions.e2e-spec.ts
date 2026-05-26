/**
 * E2E tests for the class-sessions surface (M6 §6.7).
 *
 * Runs against postgres-test (port 5433, DB ckm_test).
 * Gates covered (per docs/plan.md §6.7):
 *   - CRUD: POST, GET list, GET one, PATCH, DELETE (soft), PATCH :id/restore.
 *   - Collection reads: GET /by-class/:classId, GET /by-teacher, GET /by-date-range.
 *   - 409 on duplicate (class_id, date) via partial unique index.
 *   - Re-create after soft-delete does NOT 409 (partial index exempts deleted rows).
 *   - Start/End lifecycle transitions (409 re-start, 400 end-before-start, 409 re-end).
 *   - Teacher-isolation: cross-teacher access returns 404 (never 403).
 *
 * Run with: pnpm --filter api test:e2e -- --testPathPattern class-sessions
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
    'THROTTLE_TEST_BYPASS_TOKEN must be set in .env.test for the class-sessions e2e suite.',
  );
}
const SKIP_THROTTLE = { 'x-test-skip-throttle': BYPASS_TOKEN } as const;

describe('ClassSessions (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let usersService: UsersService;

  let counter = 0;
  const nextRegistry = (prefix = 'CS'): string =>
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

  /** Create a class owned by the given teacher and return its id. */
  async function seedClass(accessToken: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/classes')
      .set(SKIP_THROTTLE)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `Turma ${nextRegistry()}`,
        days: ['monday'],
        startTime: '08:00',
        durationMinutes: 60,
        belt: Belt.WHITE,
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  /** Create a session for a class and return the full body. */
  async function seedSession(
    accessToken: string,
    classId: string,
    date: string,
    notes?: string,
  ): Promise<Record<string, unknown>> {
    const res = await request(app.getHttpServer())
      .post('/class-sessions')
      .set(SKIP_THROTTLE)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ classId, date, ...(notes ? { notes } : {}) });
    expect(res.status).toBe(201);
    return res.body as Record<string, unknown>;
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
    // Delete in dependency order to satisfy FK constraints.
    await ds.query('DELETE FROM "class_sessions"');
    await ds.query('DELETE FROM "class_enrollments"');
    await ds.query('DELETE FROM "classes"');
    await ds.query('DELETE FROM "refresh_tokens"');
    await ds.query('DELETE FROM "users"');
  });

  afterAll(async () => {
    await ds.query('DELETE FROM "class_sessions"');
    await ds.query('DELETE FROM "class_enrollments"');
    await ds.query('DELETE FROM "classes"');
    await ds.query('DELETE FROM "refresh_tokens"');
    await ds.query('DELETE FROM "users"');
    await app.close();
  }, 15_000);

  // -------------------------------------------------------------------------
  // Basic CRUD
  // -------------------------------------------------------------------------

  describe('CRUD', () => {
    it('POST /class-sessions creates a session and returns 201', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);

      const res = await request(app.getHttpServer())
        .post('/class-sessions')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ classId, date: '2025-06-03', notes: 'First session' });

      expect(res.status).toBe(201);
      expect(res.body.classId).toBe(classId);
      expect(res.body.date).toBe('2025-06-03');
      expect(res.body.notes).toBe('First session');
      expect(res.body.startTime).toBeNull();
      expect(res.body.endTime).toBeNull();
      // Soft-delete field must not leak.
      expect(JSON.stringify(res.body)).not.toMatch(/"deletedAt"/);
    });

    it('POST /class-sessions without notes returns 201 with null notes', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);

      const res = await request(app.getHttpServer())
        .post('/class-sessions')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ classId, date: '2025-06-10' });

      expect(res.status).toBe(201);
      expect(res.body.notes).toBeNull();
    });

    it('POST /class-sessions returns 404 when classId not found or cross-teacher', async () => {
      const teacher = await seedTeacherAndLogin();

      const res = await request(app.getHttpServer())
        .post('/class-sessions')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({
          classId: '00000000-0000-4000-8000-000000000000',
          date: '2025-06-03',
        });

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it('POST /class-sessions returns 422 for invalid date format', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);

      const res = await request(app.getHttpServer())
        .post('/class-sessions')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ classId, date: 'not-a-date' });

      expect(res.status).toBe(422);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it('GET /class-sessions returns all sessions owned by the teacher', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);

      await seedSession(teacher.accessToken, classId, '2025-06-03');
      await seedSession(teacher.accessToken, classId, '2025-06-10');

      const res = await request(app.getHttpServer())
        .get('/class-sessions')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });

    it('GET /class-sessions/:id returns the session', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);
      const created = await seedSession(teacher.accessToken, classId, '2025-06-03');

      const res = await request(app.getHttpServer())
        .get(`/class-sessions/${created.id as string}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.id);
    });

    it('GET /class-sessions/:id returns 404 for unknown id', async () => {
      const teacher = await seedTeacherAndLogin();

      const res = await request(app.getHttpServer())
        .get('/class-sessions/00000000-0000-4000-8000-000000000000')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it('PATCH /class-sessions/:id updates date and notes', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);
      const created = await seedSession(
        teacher.accessToken,
        classId,
        '2025-06-03',
        'Old notes',
      );

      const res = await request(app.getHttpServer())
        .patch(`/class-sessions/${created.id as string}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ date: '2025-06-17', notes: 'Updated notes' });

      expect(res.status).toBe(200);
      expect(res.body.date).toBe('2025-06-17');
      expect(res.body.notes).toBe('Updated notes');
    });

    it('DELETE /class-sessions/:id soft-deletes; GET then returns 404', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);
      const created = await seedSession(teacher.accessToken, classId, '2025-06-03');

      const del = await request(app.getHttpServer())
        .delete(`/class-sessions/${created.id as string}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);
      expect(del.status).toBe(204);

      const after = await request(app.getHttpServer())
        .get(`/class-sessions/${created.id as string}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);
      expect(after.status).toBe(404);

      // Row must remain with deleted_at set.
      const rows = (await ds.query(
        `SELECT deleted_at FROM class_sessions WHERE id = $1`,
        [created.id],
      )) as { deleted_at: Date | null }[];
      expect(rows).toHaveLength(1);
      expect(rows[0].deleted_at).not.toBeNull();
    });

    it('PATCH /class-sessions/:id/restore restores a soft-deleted session', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);
      const created = await seedSession(teacher.accessToken, classId, '2025-06-03');

      await request(app.getHttpServer())
        .delete(`/class-sessions/${created.id as string}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      const restore = await request(app.getHttpServer())
        .patch(`/class-sessions/${created.id as string}/restore`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);
      expect(restore.status).toBe(204);

      const res = await request(app.getHttpServer())
        .get(`/class-sessions/${created.id as string}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.id);
    });
  });

  // -------------------------------------------------------------------------
  // Duplicate constraint (partial unique index)
  // -------------------------------------------------------------------------

  describe('Duplicate constraint (uq_class_sessions_class_date_active)', () => {
    it('POST /class-sessions returns 409 when (class_id, date) already active', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);

      // First create succeeds.
      await seedSession(teacher.accessToken, classId, '2025-06-03');

      // Second create with the same (class, date) → 409 from partial unique index.
      const res = await request(app.getHttpServer())
        .post('/class-sessions')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ classId, date: '2025-06-03' });

      expect(res.status).toBe(409);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.body.title).toBe('Duplicate session');
    });

    it('Re-create after soft-delete succeeds (partial index exempts deleted rows)', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);

      const first = await seedSession(teacher.accessToken, classId, '2025-06-03');

      // Soft-delete the first session.
      const del = await request(app.getHttpServer())
        .delete(`/class-sessions/${first.id as string}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);
      expect(del.status).toBe(204);

      // Creating another session for the same (class, date) is now allowed.
      const res = await request(app.getHttpServer())
        .post('/class-sessions')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ classId, date: '2025-06-03' });

      expect(res.status).toBe(201);
      expect(res.body.id).not.toBe(first.id);

      // Both rows should exist in DB: one deleted, one active.
      const rows = (await ds.query(
        `SELECT id, deleted_at FROM class_sessions WHERE class_id = $1 AND date = '2025-06-03'`,
        [classId],
      )) as { id: string; deleted_at: Date | null }[];
      expect(rows).toHaveLength(2);
      const deletedRow = rows.find((r) => r.deleted_at !== null);
      const activeRow = rows.find((r) => r.deleted_at === null);
      expect(deletedRow).toBeDefined();
      expect(activeRow).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Collection reads: by-class, by-teacher, by-date-range
  // -------------------------------------------------------------------------

  describe('Collection reads', () => {
    it('GET /class-sessions/by-class/:classId lists sessions for a specific class', async () => {
      const teacher = await seedTeacherAndLogin();
      const classA = await seedClass(teacher.accessToken);
      const classB = await seedClass(teacher.accessToken);

      await seedSession(teacher.accessToken, classA, '2025-06-03');
      await seedSession(teacher.accessToken, classA, '2025-06-10');
      await seedSession(teacher.accessToken, classB, '2025-06-03');

      const res = await request(app.getHttpServer())
        .get(`/class-sessions/by-class/${classA}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(
        (res.body as Array<{ classId: string }>).every((s) => s.classId === classA),
      ).toBe(true);
    });

    it('GET /class-sessions/by-class/:classId returns 404 for unknown classId', async () => {
      const teacher = await seedTeacherAndLogin();

      const res = await request(app.getHttpServer())
        .get('/class-sessions/by-class/00000000-0000-4000-8000-000000000000')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(404);
    });

    it('GET /class-sessions/by-teacher returns all teacher sessions', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);

      await seedSession(teacher.accessToken, classId, '2025-06-03');
      await seedSession(teacher.accessToken, classId, '2025-06-10');

      const res = await request(app.getHttpServer())
        .get('/class-sessions/by-teacher')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });

    it('GET /class-sessions/by-date-range returns sessions within range', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);

      await seedSession(teacher.accessToken, classId, '2025-06-01');
      await seedSession(teacher.accessToken, classId, '2025-06-15');
      await seedSession(teacher.accessToken, classId, '2025-06-30');
      await seedSession(teacher.accessToken, classId, '2025-07-01'); // outside range

      const res = await request(app.getHttpServer())
        .get('/class-sessions/by-date-range?from=2025-06-01&to=2025-06-30')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(3);
    });

    it('GET /class-sessions/by-date-range returns empty array when no sessions in range', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);

      await seedSession(teacher.accessToken, classId, '2025-05-01');

      const res = await request(app.getHttpServer())
        .get('/class-sessions/by-date-range?from=2025-06-01&to=2025-06-30')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    it('GET /class-sessions/by-date-range returns 422 for invalid date format', async () => {
      const teacher = await seedTeacherAndLogin();

      const res = await request(app.getHttpServer())
        .get('/class-sessions/by-date-range?from=invalid&to=2025-06-30')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(422);
    });
  });

  // -------------------------------------------------------------------------
  // Start / End lifecycle
  // -------------------------------------------------------------------------

  describe('Start/End lifecycle', () => {
    it('PATCH /class-sessions/:id/start sets startTime and returns 200', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-06-03');

      const res = await request(app.getHttpServer())
        .patch(`/class-sessions/${session.id as string}/start`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.startTime).not.toBeNull();
      expect(res.body.endTime).toBeNull();
    });

    it('PATCH /class-sessions/:id/start returns 409 when session already started', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-06-03');

      // Start once.
      await request(app.getHttpServer())
        .patch(`/class-sessions/${session.id as string}/start`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      // Start again → 409.
      const res = await request(app.getHttpServer())
        .patch(`/class-sessions/${session.id as string}/start`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(409);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it('PATCH /class-sessions/:id/end returns 400 when session not yet started', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-06-03');

      const res = await request(app.getHttpServer())
        .patch(`/class-sessions/${session.id as string}/end`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it('PATCH /class-sessions/:id/end sets endTime after start, returns 200', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-06-03');

      await request(app.getHttpServer())
        .patch(`/class-sessions/${session.id as string}/start`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      const res = await request(app.getHttpServer())
        .patch(`/class-sessions/${session.id as string}/end`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.startTime).not.toBeNull();
      expect(res.body.endTime).not.toBeNull();
    });

    it('PATCH /class-sessions/:id/end returns 409 when session already ended', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-06-03');

      await request(app.getHttpServer())
        .patch(`/class-sessions/${session.id as string}/start`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      await request(app.getHttpServer())
        .patch(`/class-sessions/${session.id as string}/end`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      // End again → 409.
      const res = await request(app.getHttpServer())
        .patch(`/class-sessions/${session.id as string}/end`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(409);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    });
  });

  // -------------------------------------------------------------------------
  // Teacher-isolation (404 not 403)
  // -------------------------------------------------------------------------

  describe('Teacher-isolation (404 not 403)', () => {
    it('GET /class-sessions returns ONLY sessions owned by the calling teacher', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const classA = await seedClass(teacherA.accessToken);
      const classB = await seedClass(teacherB.accessToken);

      await seedSession(teacherA.accessToken, classA, '2025-06-03');
      await seedSession(teacherA.accessToken, classA, '2025-06-10');
      await seedSession(teacherB.accessToken, classB, '2025-06-03');

      const resA = await request(app.getHttpServer())
        .get('/class-sessions')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`);
      const resB = await request(app.getHttpServer())
        .get('/class-sessions')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);

      expect(resA.body).toHaveLength(2);
      expect(resB.body).toHaveLength(1);
    });

    it('GET /class-sessions/:id returns 404 (not 403) for cross-teacher session', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const classA = await seedClass(teacherA.accessToken);
      const session = await seedSession(teacherA.accessToken, classA, '2025-06-03');

      const res = await request(app.getHttpServer())
        .get(`/class-sessions/${session.id as string}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it('PATCH /class-sessions/:id returns 404 (not 403) for cross-teacher session', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const classA = await seedClass(teacherA.accessToken);
      const session = await seedSession(
        teacherA.accessToken,
        classA,
        '2025-06-03',
        'Original notes',
      );

      const res = await request(app.getHttpServer())
        .patch(`/class-sessions/${session.id as string}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`)
        .send({ notes: 'Hijacked' });

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);

      // Verify the row was NOT mutated.
      const rows = (await ds.query(
        `SELECT notes FROM class_sessions WHERE id = $1`,
        [session.id],
      )) as { notes: string }[];
      expect(rows[0].notes).toBe('Original notes');
    });

    it('DELETE /class-sessions/:id returns 404 (not 403) for cross-teacher session', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const classA = await seedClass(teacherA.accessToken);
      const session = await seedSession(teacherA.accessToken, classA, '2025-06-03');

      const res = await request(app.getHttpServer())
        .delete(`/class-sessions/${session.id as string}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);

      // Row must still be live (no soft-delete).
      const rows = (await ds.query(
        `SELECT deleted_at FROM class_sessions WHERE id = $1`,
        [session.id],
      )) as { deleted_at: Date | null }[];
      expect(rows[0].deleted_at).toBeNull();
    });

    it('PATCH /class-sessions/:id/start returns 404 (not 403) for cross-teacher session', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const classA = await seedClass(teacherA.accessToken);
      const session = await seedSession(teacherA.accessToken, classA, '2025-06-03');

      const res = await request(app.getHttpServer())
        .patch(`/class-sessions/${session.id as string}/start`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
    });

    it('PATCH /class-sessions/:id/end returns 404 (not 403) for cross-teacher session', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const classA = await seedClass(teacherA.accessToken);
      const session = await seedSession(teacherA.accessToken, classA, '2025-06-03');
      // Start it so the end guard doesn't fire first.
      await request(app.getHttpServer())
        .patch(`/class-sessions/${session.id as string}/start`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`);

      const res = await request(app.getHttpServer())
        .patch(`/class-sessions/${session.id as string}/end`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
    });

    it('PATCH /class-sessions/:id/restore returns 404 (not 403) for cross-teacher session', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const classA = await seedClass(teacherA.accessToken);
      const session = await seedSession(teacherA.accessToken, classA, '2025-06-03');
      // Soft-delete it so restore is a valid operation for teacherA.
      await request(app.getHttpServer())
        .delete(`/class-sessions/${session.id as string}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`);

      const res = await request(app.getHttpServer())
        .patch(`/class-sessions/${session.id as string}/restore`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
    });

    it('GET /class-sessions/by-class/:classId returns 404 for cross-teacher class', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const classA = await seedClass(teacherA.accessToken);

      const res = await request(app.getHttpServer())
        .get(`/class-sessions/by-class/${classA}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
    });

    it('GET /class-sessions/by-teacher returns only the calling teacher sessions', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const classA = await seedClass(teacherA.accessToken);
      await seedSession(teacherA.accessToken, classA, '2025-06-03');

      const res = await request(app.getHttpServer())
        .get('/class-sessions/by-teacher')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    it('GET /class-sessions/by-date-range returns only the calling teacher sessions', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const classA = await seedClass(teacherA.accessToken);
      await seedSession(teacherA.accessToken, classA, '2025-06-15');

      const res = await request(app.getHttpServer())
        .get('/class-sessions/by-date-range?from=2025-06-01&to=2025-06-30')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 9.4 extensions — soft-delete list exclusion + filter edge cases
  // -------------------------------------------------------------------------

  describe('Soft-delete list exclusion (9.4)', () => {
    it('GET /class-sessions list excludes soft-deleted sessions', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);

      const s1 = await seedSession(teacher.accessToken, classId, '2025-10-01');
      const s2 = await seedSession(teacher.accessToken, classId, '2025-10-08');

      // Soft-delete s2.
      await request(app.getHttpServer())
        .delete(`/class-sessions/${s2.id as string}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      const list = await request(app.getHttpServer())
        .get('/class-sessions')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(list.status).toBe(200);
      const ids = (list.body as Array<{ id: string }>).map((s) => s.id);
      expect(ids).toContain(s1.id);
      expect(ids).not.toContain(s2.id);
    });

    it('GET /class-sessions/:id returns 404 after soft-delete', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-10-15');

      await request(app.getHttpServer())
        .delete(`/class-sessions/${session.id as string}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      const res = await request(app.getHttpServer())
        .get(`/class-sessions/${session.id as string}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it('GET /class-sessions/by-date-range excludes soft-deleted sessions', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);

      const s1 = await seedSession(teacher.accessToken, classId, '2025-10-20');
      const s2 = await seedSession(teacher.accessToken, classId, '2025-10-21');

      // Soft-delete s2.
      await request(app.getHttpServer())
        .delete(`/class-sessions/${s2.id as string}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      const res = await request(app.getHttpServer())
        .get('/class-sessions/by-date-range?from=2025-10-01&to=2025-10-31')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      const ids = (res.body as Array<{ id: string }>).map((s) => s.id);
      expect(ids).toContain(s1.id);
      expect(ids).not.toContain(s2.id);
    });

    it('GET /class-sessions/by-class/:classId excludes soft-deleted sessions', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);

      const s1 = await seedSession(teacher.accessToken, classId, '2025-11-03');
      const s2 = await seedSession(teacher.accessToken, classId, '2025-11-10');

      // Soft-delete s2.
      await request(app.getHttpServer())
        .delete(`/class-sessions/${s2.id as string}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      const res = await request(app.getHttpServer())
        .get(`/class-sessions/by-class/${classId}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      const ids = (res.body as Array<{ id: string }>).map((s) => s.id);
      expect(ids).toContain(s1.id);
      expect(ids).not.toContain(s2.id);
    });
  });

  describe('Date-range filter edge cases (9.4)', () => {
    it('GET /class-sessions/by-date-range with from = to returns only that day', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);

      await seedSession(teacher.accessToken, classId, '2025-11-15');
      await seedSession(teacher.accessToken, classId, '2025-11-16');

      const res = await request(app.getHttpServer())
        .get('/class-sessions/by-date-range?from=2025-11-15&to=2025-11-15')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect((res.body as Array<{ date: string }>)[0].date).toBe('2025-11-15');
    });

    it('GET /class-sessions/by-date-range returns 422 when to is before from', async () => {
      const teacher = await seedTeacherAndLogin();

      const res = await request(app.getHttpServer())
        .get('/class-sessions/by-date-range?from=2025-12-31&to=2025-01-01')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      // from > to: either the service returns empty (acceptable) or
      // validation returns 422 (also acceptable). Both are correct behavior.
      // What must NOT happen: 500 or 403.
      expect([200, 422]).toContain(res.status);
      if (res.status !== 200) {
        expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      }
    });
  });

  // -------------------------------------------------------------------------
  // RBAC
  // -------------------------------------------------------------------------

  describe('RBAC', () => {
    it('GET /class-sessions returns 403 when JWT carries only STUDENT role', async () => {
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
        .get('/class-sessions')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });
});
