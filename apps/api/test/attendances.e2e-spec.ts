/**
 * E2E tests for the attendances surface (M7 §7.7).
 *
 * Runs against postgres-test (port 5433, DB ckm_test).
 *
 * Coverage (per docs/plan.md §7.7):
 *   1. Bulk create idempotency — POST /attendances/bulk twice → same IDs, no duplicates.
 *   2. Guest attendance (is_enrolled_class=false) — student not enrolled → snapshot false.
 *   3. Every status shortcut — PRESENT (checkedInAt set), LATE (checkedInAt set),
 *      ABSENT (checkedInAt cleared), EXCUSED (checkedInAt cleared).
 *   4. 422 on invalid body — missing required fields.
 *   5. Teacher isolation — teacher B cannot read/modify teacher A's attendances → 404.
 *   6. Single create idempotency — POST /attendances twice → same ID, one row.
 *   7. Notes update — PATCH /attendances/:id/notes persists the note.
 *
 * Run with: pnpm --filter api test:e2e -- --testPathPattern attendances
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
    'THROTTLE_TEST_BYPASS_TOKEN must be set in .env.test for the attendances e2e suite.',
  );
}
const SKIP_THROTTLE = { 'x-test-skip-throttle': BYPASS_TOKEN } as const;

describe('Attendances (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let usersService: UsersService;

  let counter = 0;
  const nextRegistry = (prefix = 'AT'): string =>
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

  /**
   * Create a STUDENT under the given teacher and return the student id.
   * Uses POST /students so the student is owned by (instructor_id = teacher).
   * This is required for enrollment to work — the enroll endpoint validates
   * that the student belongs to the calling teacher.
   */
  async function seedStudent(teacherToken: string): Promise<{ id: string }> {
    const registry = nextRegistry('S');
    const res = await request(app.getHttpServer())
      .post('/students')
      .set(SKIP_THROTTLE)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: `Student ${registry}`, belt: Belt.WHITE });
    if (res.status !== 201) {
      throw new Error(
        `Failed to seed student (status ${res.status}): ${JSON.stringify(res.body)}`,
      );
    }
    return { id: res.body.id as string };
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

  /** Enroll a student in a class. */
  async function enrollStudent(
    accessToken: string,
    classId: string,
    studentId: string,
  ): Promise<void> {
    const res = await request(app.getHttpServer())
      .post(`/classes/${classId}/enrollments`)
      .set(SKIP_THROTTLE)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ studentId });
    expect(res.status).toBe(201);
  }

  /** Create a session for a class and return the full body. */
  async function seedSession(
    accessToken: string,
    classId: string,
    date: string,
  ): Promise<Record<string, unknown>> {
    const res = await request(app.getHttpServer())
      .post('/class-sessions')
      .set(SKIP_THROTTLE)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ classId, date });
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
    await ds.query('DELETE FROM "attendances"');
    await ds.query('DELETE FROM "class_sessions"');
    await ds.query('DELETE FROM "class_enrollments"');
    await ds.query('DELETE FROM "classes"');
    await ds.query('DELETE FROM "refresh_tokens"');
    await ds.query('DELETE FROM "users"');
  });

  afterAll(async () => {
    await ds.query('DELETE FROM "attendances"');
    await ds.query('DELETE FROM "class_sessions"');
    await ds.query('DELETE FROM "class_enrollments"');
    await ds.query('DELETE FROM "classes"');
    await ds.query('DELETE FROM "refresh_tokens"');
    await ds.query('DELETE FROM "users"');
    await app.close();
  }, 15_000);

  // -------------------------------------------------------------------------
  // Case 1: Bulk create idempotency
  // -------------------------------------------------------------------------

  describe('Case 1: Bulk create idempotency', () => {
    it('POST /attendances/bulk twice returns same IDs — no duplicates', async () => {
      const teacher = await seedTeacherAndLogin();
      const student = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      await enrollStudent(teacher.accessToken, classId, student.id);
      const session = await seedSession(teacher.accessToken, classId, '2025-07-01');

      // First bulk create.
      const res1 = await request(app.getHttpServer())
        .post('/attendances/bulk')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id });

      expect(res1.status).toBe(201);
      expect(Array.isArray(res1.body)).toBe(true);
      expect(res1.body).toHaveLength(1);
      const firstId = (res1.body as Array<{ id: string }>)[0].id;

      // Second bulk create — idempotent.
      const res2 = await request(app.getHttpServer())
        .post('/attendances/bulk')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id });

      expect(res2.status).toBe(201);
      expect(res2.body).toHaveLength(1);
      const secondId = (res2.body as Array<{ id: string }>)[0].id;

      // Same ID — no new row was created.
      expect(secondId).toBe(firstId);

      // DB must have exactly ONE row for this session+student.
      const rows = (await ds.query(
        `SELECT id FROM attendances WHERE session_id = $1`,
        [session.id as string],
      )) as { id: string }[];
      expect(rows).toHaveLength(1);
    });

    it('Bulk create with multiple enrolled students creates one row per student', async () => {
      const teacher = await seedTeacherAndLogin();
      const studentA = await seedStudent(teacher.accessToken);
      const studentB = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      await enrollStudent(teacher.accessToken, classId, studentA.id);
      await enrollStudent(teacher.accessToken, classId, studentB.id);
      const session = await seedSession(teacher.accessToken, classId, '2025-07-02');

      const res = await request(app.getHttpServer())
        .post('/attendances/bulk')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id });

      expect(res.status).toBe(201);
      expect(res.body).toHaveLength(2);

      // All rows must have is_enrolled_class = true.
      const bodies = res.body as Array<{ isEnrolledClass: boolean }>;
      expect(bodies.every((r) => r.isEnrolledClass === true)).toBe(true);
    });

    it('Bulk create re-run — isEnrolledClass reflects value from FIRST insert', async () => {
      const teacher = await seedTeacherAndLogin();
      const student = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      await enrollStudent(teacher.accessToken, classId, student.id);
      const session = await seedSession(teacher.accessToken, classId, '2025-07-03');

      // First bulk create — student is enrolled → isEnrolledClass = true.
      const res1 = await request(app.getHttpServer())
        .post('/attendances/bulk')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id });

      expect(res1.status).toBe(201);
      const firstRow = (res1.body as Array<{ id: string; isEnrolledClass: boolean }>)[0];
      expect(firstRow.isEnrolledClass).toBe(true);

      // Second bulk create — same value returned, unchanged.
      const res2 = await request(app.getHttpServer())
        .post('/attendances/bulk')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id });

      expect(res2.status).toBe(201);
      const secondRow = (res2.body as Array<{ id: string; isEnrolledClass: boolean }>)[0];
      expect(secondRow.id).toBe(firstRow.id);
      expect(secondRow.isEnrolledClass).toBe(true); // Snapshot unchanged.
    });
  });

  // -------------------------------------------------------------------------
  // Case 2: Guest attendance (is_enrolled_class = false)
  // -------------------------------------------------------------------------

  describe('Case 2: Guest attendance (is_enrolled_class = false)', () => {
    it('POST /attendances for a student NOT enrolled → isEnrolledClass = false', async () => {
      const teacher = await seedTeacherAndLogin();
      const student = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      // Student is NOT enrolled in this class.
      const session = await seedSession(teacher.accessToken, classId, '2025-07-10');

      const res = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id, studentId: student.id });

      expect(res.status).toBe(201);
      expect((res.body as { isEnrolledClass: boolean }).isEnrolledClass).toBe(false);
    });

    it('POST /attendances for a student who IS enrolled → isEnrolledClass = true', async () => {
      const teacher = await seedTeacherAndLogin();
      const student = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      await enrollStudent(teacher.accessToken, classId, student.id);
      const session = await seedSession(teacher.accessToken, classId, '2025-07-11');

      const res = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id, studentId: student.id });

      expect(res.status).toBe(201);
      expect((res.body as { isEnrolledClass: boolean }).isEnrolledClass).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Case 3: Every status shortcut
  // -------------------------------------------------------------------------

  describe('Case 3: Status shortcuts', () => {
    it('PATCH /attendances/:id/present → status=present, checkedInAt set', async () => {
      const teacher = await seedTeacherAndLogin();
      const student = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-07-15');

      const created = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id, studentId: student.id });
      expect(created.status).toBe(201);
      const attendanceId = (created.body as { id: string }).id;

      const res = await request(app.getHttpServer())
        .patch(`/attendances/${attendanceId}/present`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect((res.body as { status: string }).status).toBe('present');
      expect((res.body as { checkedInAt: string | null }).checkedInAt).not.toBeNull();
    });

    it('PATCH /attendances/:id/late → status=late, checkedInAt set', async () => {
      const teacher = await seedTeacherAndLogin();
      const student = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-07-16');

      const created = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id, studentId: student.id });
      expect(created.status).toBe(201);
      const attendanceId = (created.body as { id: string }).id;

      const res = await request(app.getHttpServer())
        .patch(`/attendances/${attendanceId}/late`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect((res.body as { status: string }).status).toBe('late');
      expect((res.body as { checkedInAt: string | null }).checkedInAt).not.toBeNull();
    });

    it('PATCH /attendances/:id/absent → status=absent, checkedInAt cleared', async () => {
      const teacher = await seedTeacherAndLogin();
      const student = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-07-17');

      const created = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id, studentId: student.id });
      expect(created.status).toBe(201);
      const attendanceId = (created.body as { id: string }).id;

      // Mark present first to set checkedInAt.
      await request(app.getHttpServer())
        .patch(`/attendances/${attendanceId}/present`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      // Mark absent — checkedInAt should be cleared.
      const res = await request(app.getHttpServer())
        .patch(`/attendances/${attendanceId}/absent`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect((res.body as { status: string }).status).toBe('absent');
      expect((res.body as { checkedInAt: string | null }).checkedInAt).toBeNull();
    });

    it('PATCH /attendances/:id/excused → status=excused, checkedInAt cleared', async () => {
      const teacher = await seedTeacherAndLogin();
      const student = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-07-18');

      const created = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id, studentId: student.id });
      expect(created.status).toBe(201);
      const attendanceId = (created.body as { id: string }).id;

      // Mark late first to set checkedInAt.
      await request(app.getHttpServer())
        .patch(`/attendances/${attendanceId}/late`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      // Mark excused — checkedInAt should be cleared.
      const res = await request(app.getHttpServer())
        .patch(`/attendances/${attendanceId}/excused`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect((res.body as { status: string }).status).toBe('excused');
      expect((res.body as { checkedInAt: string | null }).checkedInAt).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Case 4: 422 on invalid body
  // -------------------------------------------------------------------------

  describe('Case 4: 422 on invalid body', () => {
    it('POST /attendances without sessionId returns 422 problem+json', async () => {
      const teacher = await seedTeacherAndLogin();

      const res = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ studentId: '00000000-0000-4000-8000-000000000000' });

      expect(res.status).toBe(422);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it('POST /attendances without studentId returns 422 problem+json', async () => {
      const teacher = await seedTeacherAndLogin();

      const res = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: '00000000-0000-4000-8000-000000000000' });

      expect(res.status).toBe(422);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it('POST /attendances/bulk without sessionId returns 422 problem+json', async () => {
      const teacher = await seedTeacherAndLogin();

      const res = await request(app.getHttpServer())
        .post('/attendances/bulk')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({});

      expect(res.status).toBe(422);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it('POST /attendances with invalid UUID returns 422 problem+json', async () => {
      const teacher = await seedTeacherAndLogin();

      const res = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: 'not-a-uuid', studentId: 'also-not-a-uuid' });

      expect(res.status).toBe(422);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    });
  });

  // -------------------------------------------------------------------------
  // Case 5: Teacher isolation (404 not 403)
  // -------------------------------------------------------------------------

  describe('Case 5: Teacher isolation (404 not 403)', () => {
    it('GET /attendances returns ONLY attendance rows owned by calling teacher', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const studentA = await seedStudent(teacherA.accessToken);
      const studentB = await seedStudent(teacherB.accessToken);

      const classA = await seedClass(teacherA.accessToken);
      const classB = await seedClass(teacherB.accessToken);

      const sessionA = await seedSession(teacherA.accessToken, classA, '2025-07-20');
      const sessionB = await seedSession(teacherB.accessToken, classB, '2025-07-20');

      // Create attendance for teacher A's session.
      await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`)
        .send({ sessionId: sessionA.id, studentId: studentA.id });

      // Create attendance for teacher B's session.
      await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`)
        .send({ sessionId: sessionB.id, studentId: studentB.id });

      // Teacher A sees only their own.
      const resA = await request(app.getHttpServer())
        .get('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`);
      expect(resA.status).toBe(200);
      expect(Array.isArray(resA.body)).toBe(true);
      expect(resA.body).toHaveLength(1);

      // Teacher B sees only their own.
      const resB = await request(app.getHttpServer())
        .get('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);
      expect(resB.status).toBe(200);
      expect(resB.body).toHaveLength(1);
    });

    it('GET /attendances/:id returns 404 (not 403) for cross-teacher attendance', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const student = await seedStudent(teacherA.accessToken);
      const classA = await seedClass(teacherA.accessToken);
      const sessionA = await seedSession(teacherA.accessToken, classA, '2025-07-21');

      const created = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`)
        .send({ sessionId: sessionA.id, studentId: student.id });
      expect(created.status).toBe(201);

      // Teacher B tries to access teacher A's attendance.
      const res = await request(app.getHttpServer())
        .get(`/attendances/${(created.body as { id: string }).id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it('PATCH /attendances/:id/present returns 404 (not 403) for cross-teacher attendance', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const student = await seedStudent(teacherA.accessToken);
      const classA = await seedClass(teacherA.accessToken);
      const sessionA = await seedSession(teacherA.accessToken, classA, '2025-07-22');

      const created = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`)
        .send({ sessionId: sessionA.id, studentId: student.id });
      expect(created.status).toBe(201);

      // Teacher B tries to mark present.
      const res = await request(app.getHttpServer())
        .patch(`/attendances/${(created.body as { id: string }).id}/present`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);

      // Verify status was NOT mutated.
      const rows = (await ds.query(
        `SELECT status FROM attendances WHERE id = $1`,
        [(created.body as { id: string }).id],
      )) as { status: string }[];
      expect(rows[0].status).toBe('pending');
    });

    it('PATCH /attendances/:id/notes returns 404 (not 403) for cross-teacher attendance', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const student = await seedStudent(teacherA.accessToken);
      const classA = await seedClass(teacherA.accessToken);
      const sessionA = await seedSession(teacherA.accessToken, classA, '2025-07-23');

      const created = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`)
        .send({ sessionId: sessionA.id, studentId: student.id });
      expect(created.status).toBe(201);

      // Teacher B tries to update notes.
      const res = await request(app.getHttpServer())
        .patch(`/attendances/${(created.body as { id: string }).id}/notes`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`)
        .send({ notes: 'Hijacked note' });

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
    });

    it('POST /attendances returns 404 for session belonging to another teacher', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();
      const student = await seedStudent(teacherB.accessToken);

      const classA = await seedClass(teacherA.accessToken);
      const sessionA = await seedSession(teacherA.accessToken, classA, '2025-07-24');

      // Teacher B tries to create attendance for teacher A's session.
      const res = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`)
        .send({ sessionId: sessionA.id, studentId: student.id });

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
    });

    it('POST /attendances returns 404 when studentId belongs to another teacher', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      // Session owned by teacher A.
      const classA = await seedClass(teacherA.accessToken);
      const sessionA = await seedSession(teacherA.accessToken, classA, '2025-07-26');

      // Student owned by teacher B.
      const studentB = await seedStudent(teacherB.accessToken);

      // Teacher A tries to attach teacher B's student to A's own session.
      const res = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherA.accessToken}`)
        .send({ sessionId: sessionA.id, studentId: studentB.id });

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
    });

    it('POST /attendances/bulk returns 404 for session belonging to another teacher', async () => {
      const teacherA = await seedTeacherAndLogin();
      const teacherB = await seedTeacherAndLogin();

      const classA = await seedClass(teacherA.accessToken);
      const sessionA = await seedSession(teacherA.accessToken, classA, '2025-07-25');

      const res = await request(app.getHttpServer())
        .post('/attendances/bulk')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacherB.accessToken}`)
        .send({ sessionId: sessionA.id });

      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Case 6: Single create idempotency
  // -------------------------------------------------------------------------

  describe('Case 6: Single create idempotency', () => {
    it('POST /attendances twice for same (session, student) → same ID, one row', async () => {
      const teacher = await seedTeacherAndLogin();
      const student = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-07-30');

      // First create.
      const res1 = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id, studentId: student.id });
      expect(res1.status).toBe(201);
      const firstId = (res1.body as { id: string }).id;

      // Second create — idempotent.
      const res2 = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id, studentId: student.id });
      expect(res2.status).toBe(201);
      const secondId = (res2.body as { id: string }).id;

      // Same ID returned.
      expect(secondId).toBe(firstId);

      // DB has exactly ONE row.
      const rows = (await ds.query(
        `SELECT id FROM attendances WHERE session_id = $1 AND student_id = $2`,
        [session.id as string, student.id],
      )) as { id: string }[];
      expect(rows).toHaveLength(1);
    });

    it('concurrent POST /attendances for same (session, student) → no 409, one row', async () => {
      const teacher = await seedTeacherAndLogin();
      const student = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-07-31');

      const post = () =>
        request(app.getHttpServer())
          .post('/attendances')
          .set(SKIP_THROTTLE)
          .set('Authorization', `Bearer ${teacher.accessToken}`)
          .send({ sessionId: session.id, studentId: student.id });

      // Fire several creates in parallel — the race must resolve to the same
      // row, never a 409.
      const responses = await Promise.all([post(), post(), post(), post()]);

      for (const res of responses) {
        expect(res.status).toBe(201);
      }
      const ids = responses.map((r) => (r.body as { id: string }).id);
      expect(new Set(ids).size).toBe(1);

      const rows = (await ds.query(
        `SELECT id FROM attendances WHERE session_id = $1 AND student_id = $2`,
        [session.id as string, student.id],
      )) as { id: string }[];
      expect(rows).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Case 7: Notes update
  // -------------------------------------------------------------------------

  describe('Case 7: Notes update', () => {
    it('PATCH /attendances/:id/notes persists the note', async () => {
      const teacher = await seedTeacherAndLogin();
      const student = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-08-01');

      const created = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id, studentId: student.id });
      expect(created.status).toBe(201);
      const attendanceId = (created.body as { id: string }).id;

      // Patch notes.
      const res = await request(app.getHttpServer())
        .patch(`/attendances/${attendanceId}/notes`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ notes: 'Student asked a great question about armbar mechanics.' });

      expect(res.status).toBe(200);
      expect((res.body as { notes: string }).notes).toBe(
        'Student asked a great question about armbar mechanics.',
      );

      // Verify via GET.
      const fetched = await request(app.getHttpServer())
        .get(`/attendances/${attendanceId}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);
      expect(fetched.status).toBe(200);
      expect((fetched.body as { notes: string }).notes).toBe(
        'Student asked a great question about armbar mechanics.',
      );
    });

    it('PATCH /attendances/:id/notes clears notes when null is sent', async () => {
      const teacher = await seedTeacherAndLogin();
      const student = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-08-02');

      const created = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({
          sessionId: session.id,
          studentId: student.id,
          notes: 'Initial note',
        });
      expect(created.status).toBe(201);
      const attendanceId = (created.body as { id: string }).id;

      // Clear notes.
      const res = await request(app.getHttpServer())
        .patch(`/attendances/${attendanceId}/notes`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ notes: null });

      expect(res.status).toBe(200);
      expect((res.body as { notes: string | null }).notes).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Additional: soft-delete field must not leak in responses
  // -------------------------------------------------------------------------

  describe('Response shape: deletedAt must not leak', () => {
    it('POST /attendances response does not include deletedAt', async () => {
      const teacher = await seedTeacherAndLogin();
      const student = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-08-10');

      const res = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id, studentId: student.id });

      expect(res.status).toBe(201);
      expect(JSON.stringify(res.body)).not.toMatch(/"deletedAt"/);
    });
  });

  // -------------------------------------------------------------------------
  // 9.4 extensions — additional filter combinations and edge cases
  // -------------------------------------------------------------------------

  describe('Query filter combinations (9.4)', () => {
    it('GET /attendances?studentId= filters by student', async () => {
      const teacher = await seedTeacherAndLogin();
      const studentA = await seedStudent(teacher.accessToken);
      const studentB = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-09-10');

      await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id, studentId: studentA.id });

      await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id, studentId: studentB.id });

      const res = await request(app.getHttpServer())
        .get(`/attendances?studentId=${studentA.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect((res.body as Array<{ studentId: string }>)[0].studentId).toBe(studentA.id);
    });

    it('GET /attendances?status=late filters by status', async () => {
      const teacher = await seedTeacherAndLogin();
      const studentA = await seedStudent(teacher.accessToken);
      const studentB = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-09-11');

      const a1 = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id, studentId: studentA.id });

      await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id, studentId: studentB.id });

      // Mark studentA as late.
      await request(app.getHttpServer())
        .patch(`/attendances/${(a1.body as { id: string }).id}/late`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      const res = await request(app.getHttpServer())
        .get('/attendances?status=late')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect((res.body as Array<{ status: string }>)[0].status).toBe('late');
    });

    it('GET /attendances?status=pending filters by pending status', async () => {
      const teacher = await seedTeacherAndLogin();
      const studentA = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-09-12');

      await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id, studentId: studentA.id });

      const res = await request(app.getHttpServer())
        .get('/attendances?status=pending')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect((res.body as Array<{ status: string }>)[0].status).toBe('pending');
    });

    it('GET /attendances?sessionId=&studentId= combined filter', async () => {
      const teacher = await seedTeacherAndLogin();
      const studentA = await seedStudent(teacher.accessToken);
      const studentB = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      const sessionA = await seedSession(teacher.accessToken, classId, '2025-09-15');
      const sessionB = await seedSession(teacher.accessToken, classId, '2025-09-16');

      // Create attendances for both students in both sessions.
      await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: sessionA.id, studentId: studentA.id });

      await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: sessionA.id, studentId: studentB.id });

      await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: sessionB.id, studentId: studentA.id });

      // Filter by both sessionA and studentA — should return exactly one row.
      const res = await request(app.getHttpServer())
        .get(`/attendances?sessionId=${sessionA.id as string}&studentId=${studentA.id}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect((res.body as Array<{ sessionId: string; studentId: string }>)[0].sessionId).toBe(sessionA.id);
      expect((res.body as Array<{ sessionId: string; studentId: string }>)[0].studentId).toBe(studentA.id);
    });

    it('GET /attendances returns empty array when no rows match filter', async () => {
      const teacher = await seedTeacherAndLogin();
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-09-18');
      const _ = session; // session created, no attendances

      const res = await request(app.getHttpServer())
        .get(`/attendances?sessionId=${session.id as string}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Query filters: GET /attendances?sessionId=...
  // -------------------------------------------------------------------------

  describe('Query filters', () => {
    it('GET /attendances?sessionId= filters by session', async () => {
      const teacher = await seedTeacherAndLogin();
      const studentA = await seedStudent(teacher.accessToken);
      const studentB = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      const sessionA = await seedSession(teacher.accessToken, classId, '2025-08-20');
      const sessionB = await seedSession(teacher.accessToken, classId, '2025-08-21');

      await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: sessionA.id, studentId: studentA.id });

      await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: sessionB.id, studentId: studentB.id });

      const res = await request(app.getHttpServer())
        .get(`/attendances?sessionId=${sessionA.id as string}`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect((res.body as Array<{ sessionId: string }>)[0].sessionId).toBe(sessionA.id);
    });

    it('GET /attendances?status=present filters by status', async () => {
      const teacher = await seedTeacherAndLogin();
      const studentA = await seedStudent(teacher.accessToken);
      const studentB = await seedStudent(teacher.accessToken);
      const classId = await seedClass(teacher.accessToken);
      const session = await seedSession(teacher.accessToken, classId, '2025-08-22');

      const createdA = await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id, studentId: studentA.id });
      expect(createdA.status).toBe(201);

      await request(app.getHttpServer())
        .post('/attendances')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ sessionId: session.id, studentId: studentB.id });

      // Mark studentA as present.
      await request(app.getHttpServer())
        .patch(`/attendances/${(createdA.body as { id: string }).id}/present`)
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      const res = await request(app.getHttpServer())
        .get('/attendances?status=present')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${teacher.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect((res.body as Array<{ status: string }>)[0].status).toBe('present');
    });
  });
});
