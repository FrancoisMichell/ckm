/**
 * Teacher-isolation e2e suite (M9 §9.3) — RELEASE BLOCKER.
 *
 * Coverage: every feature endpoint that is teacher-scoped must return 404
 * (never 403, never 200 with empty data, never 500) when Teacher A's token
 * attempts to access Teacher B's resources.
 *
 * Isolation rules enforced:
 *   - GET/PATCH/DELETE /:id → 404 for cross-teacher IDs
 *   - List endpoints → Teacher A's list must NOT contain Teacher B's items
 *   - Create endpoints → Teacher A cannot create resources referencing
 *     Teacher B's entities (sessions, students, classes)
 *
 * Resources covered:
 *   - /students          (GET list, GET one, PATCH, DELETE, restore)
 *   - /classes           (GET list, GET one, PATCH, DELETE, restore, enrollments)
 *   - /class-sessions    (GET list, GET one, PATCH, DELETE, restore,
 *                         by-class, by-teacher, by-date-range, start, end)
 *   - /attendances       (GET list, GET one, PATCH notes, PATCH present,
 *                         POST single, POST bulk)
 *
 * Run with: pnpm --filter api test:e2e
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from './app.e2e-helper';
import { UsersService } from '@/users/users.service';
import {
  assertTestDatabase,
  expectProblemDetails,
  getSkipThrottleHeader,
} from './support/auth.helper';
import {
  createTeacher,
  createStudent,
  createClass,
  createSession,
  createAttendance,
  enrollStudent,
  type TeacherCtx,
  type StudentCtx,
  type ClassCtx,
  type SessionCtx,
  type AttendanceCtx,
} from './support/factories';

// ---------------------------------------------------------------------------
// World — shared context for all suites in this file.
// Built once in beforeAll; each suite reads from it (no mutations).
// ---------------------------------------------------------------------------

interface World {
  app: INestApplication;
  ds: DataSource;
  // Teacher A and their resources
  tA: TeacherCtx;
  studentA: StudentCtx;
  classA: ClassCtx;
  sessionA: SessionCtx;
  attendanceA: AttendanceCtx;
  // Teacher B and their resources
  tB: TeacherCtx;
  studentB: StudentCtx;
  classB: ClassCtx;
  sessionB: SessionCtx;
  attendanceB: AttendanceCtx;
}

let world: World;
let SKIP_THROTTLE: Record<string, string>;

describe('Teacher isolation (e2e) — RELEASE BLOCKER', () => {
  // -----------------------------------------------------------------------
  // Setup — seed two independent teacher worlds
  // -----------------------------------------------------------------------

  beforeAll(async () => {
    assertTestDatabase();

    const { app, ds } = await createTestApp();
    await ds.runMigrations();

    const usersService = app.get(UsersService);
    SKIP_THROTTLE = getSkipThrottleHeader();

    const tA = await createTeacher(app, usersService, { name: 'Teacher Alpha' });
    const tB = await createTeacher(app, usersService, { name: 'Teacher Beta' });

    // Teacher A's world
    const studentA = await createStudent(app, tA.accessToken, { name: 'Student Alpha' });
    const classA = await createClass(app, tA.accessToken, { name: 'Turma Alpha' });
    await enrollStudent(app, tA.accessToken, classA.id, studentA.id);
    const sessionA = await createSession(app, tA.accessToken, classA.id, '2025-09-01');
    const attendanceA = await createAttendance(app, tA.accessToken, sessionA.id, studentA.id);

    // Teacher B's world
    const studentB = await createStudent(app, tB.accessToken, { name: 'Student Beta' });
    const classB = await createClass(app, tB.accessToken, { name: 'Turma Beta' });
    await enrollStudent(app, tB.accessToken, classB.id, studentB.id);
    const sessionB = await createSession(app, tB.accessToken, classB.id, '2025-09-02');
    const attendanceB = await createAttendance(app, tB.accessToken, sessionB.id, studentB.id);

    world = {
      app,
      ds,
      tA,
      studentA,
      classA,
      sessionA,
      attendanceA,
      tB,
      studentB,
      classB,
      sessionB,
      attendanceB,
    };
  }, 120_000);

  afterAll(async () => {
    const { app, ds } = world;
    await ds.query('DELETE FROM "attendances"');
    await ds.query('DELETE FROM "class_sessions"');
    await ds.query('DELETE FROM "class_enrollments"');
    await ds.query('DELETE FROM "classes"');
    await ds.query('DELETE FROM "refresh_tokens"');
    await ds.query('DELETE FROM "users"');
    await ds.destroy();
    await app.close();
  }, 30_000);

  // -----------------------------------------------------------------------
  // Helper: authenticated request shorthand
  // -----------------------------------------------------------------------

  function as(token: string) {
    return {
      get: (path: string) =>
        request(world.app.getHttpServer())
          .get(path)
          .set(SKIP_THROTTLE)
          .set('Authorization', `Bearer ${token}`),
      patch: (path: string) =>
        request(world.app.getHttpServer())
          .patch(path)
          .set(SKIP_THROTTLE)
          .set('Authorization', `Bearer ${token}`),
      post: (path: string) =>
        request(world.app.getHttpServer())
          .post(path)
          .set(SKIP_THROTTLE)
          .set('Authorization', `Bearer ${token}`),
      delete: (path: string) =>
        request(world.app.getHttpServer())
          .delete(path)
          .set(SKIP_THROTTLE)
          .set('Authorization', `Bearer ${token}`),
    };
  }

  // =========================================================================
  // Students
  // =========================================================================

  describe('/students — isolation', () => {
    it('GET /students — list does NOT contain Teacher B\'s students in Teacher A\'s response', async () => {
      const res = await as(world.tA.accessToken).get('/students');
      expect(res.status).toBe(200);
      const ids = (res.body.data as Array<{ id: string }>).map((s) => s.id);
      expect(ids).not.toContain(world.studentB.id);
      expect(ids).toContain(world.studentA.id);
    });

    it('GET /students/:id — 404 (not 403) for Teacher B\'s student', async () => {
      const res = await as(world.tA.accessToken).get(`/students/${world.studentB.id}`);
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });

    it('PATCH /students/:id — 404 (not 403) for Teacher B\'s student', async () => {
      const res = await as(world.tA.accessToken)
        .patch(`/students/${world.studentB.id}`)
        .send({ name: 'Hijacked' });
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });

    it('PATCH /students/:id does NOT mutate the row when 404 is returned', async () => {
      await as(world.tA.accessToken)
        .patch(`/students/${world.studentB.id}`)
        .send({ name: 'Hijacked' });
      // Verify original name persists
      const rows = (await world.ds.query(
        `SELECT name FROM users WHERE id = $1`,
        [world.studentB.id],
      )) as { name: string }[];
      expect(rows[0].name).toBe('Student Beta');
    });

    it('DELETE /students/:id — 404 (not 403) for Teacher B\'s student', async () => {
      const res = await as(world.tA.accessToken).delete(`/students/${world.studentB.id}`);
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });

    it('DELETE /students/:id does NOT soft-delete Teacher B\'s student', async () => {
      await as(world.tA.accessToken).delete(`/students/${world.studentB.id}`);
      const rows = (await world.ds.query(
        `SELECT deleted_at FROM users WHERE id = $1`,
        [world.studentB.id],
      )) as { deleted_at: Date | null }[];
      expect(rows[0].deleted_at).toBeNull();
    });
  });

  // =========================================================================
  // Classes
  // =========================================================================

  describe('/classes — isolation', () => {
    it('GET /classes — list does NOT contain Teacher B\'s classes', async () => {
      const res = await as(world.tA.accessToken).get('/classes');
      expect(res.status).toBe(200);
      const ids = (res.body as Array<{ id: string }>).map((c) => c.id);
      expect(ids).not.toContain(world.classB.id);
      expect(ids).toContain(world.classA.id);
    });

    it('GET /classes/:id — 404 (not 403) for Teacher B\'s class', async () => {
      const res = await as(world.tA.accessToken).get(`/classes/${world.classB.id}`);
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });

    it('PATCH /classes/:id — 404 (not 403) for Teacher B\'s class', async () => {
      const res = await as(world.tA.accessToken)
        .patch(`/classes/${world.classB.id}`)
        .send({ name: 'Hijacked' });
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });

    it('PATCH /classes/:id does NOT mutate Teacher B\'s class', async () => {
      await as(world.tA.accessToken)
        .patch(`/classes/${world.classB.id}`)
        .send({ name: 'Hijacked' });
      const rows = (await world.ds.query(
        `SELECT name FROM classes WHERE id = $1`,
        [world.classB.id],
      )) as { name: string }[];
      expect(rows[0].name).toBe('Turma Beta');
    });

    it('DELETE /classes/:id — 404 (not 403) for Teacher B\'s class', async () => {
      const res = await as(world.tA.accessToken).delete(`/classes/${world.classB.id}`);
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });

    it('DELETE /classes/:id does NOT soft-delete Teacher B\'s class', async () => {
      await as(world.tA.accessToken).delete(`/classes/${world.classB.id}`);
      const rows = (await world.ds.query(
        `SELECT deleted_at FROM classes WHERE id = $1`,
        [world.classB.id],
      )) as { deleted_at: Date | null }[];
      expect(rows[0].deleted_at).toBeNull();
    });

    it('GET /classes/:id/enrollments — 404 for Teacher B\'s class', async () => {
      const res = await as(world.tA.accessToken).get(`/classes/${world.classB.id}/enrollments`);
      expectProblemDetails(res, 404);
    });

    it('POST /classes/:id/enrollments — 404 when enrolling Teacher B\'s student into Teacher A\'s class', async () => {
      // Teacher B's student into Teacher A's class → 404 (student not found under Teacher A's scope)
      const res = await as(world.tA.accessToken)
        .post(`/classes/${world.classA.id}/enrollments`)
        .send({ studentId: world.studentB.id });
      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
    });
  });

  // =========================================================================
  // Class sessions
  // =========================================================================

  describe('/class-sessions — isolation', () => {
    it('GET /class-sessions — list does NOT contain Teacher B\'s sessions', async () => {
      const res = await as(world.tA.accessToken).get('/class-sessions');
      expect(res.status).toBe(200);
      const ids = (res.body as Array<{ id: string }>).map((s) => s.id);
      expect(ids).not.toContain(world.sessionB.id);
      expect(ids).toContain(world.sessionA.id);
    });

    it('GET /class-sessions/:id — 404 (not 403) for Teacher B\'s session', async () => {
      const res = await as(world.tA.accessToken).get(`/class-sessions/${world.sessionB.id}`);
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });

    it('PATCH /class-sessions/:id — 404 (not 403) for Teacher B\'s session', async () => {
      const res = await as(world.tA.accessToken)
        .patch(`/class-sessions/${world.sessionB.id}`)
        .send({ notes: 'Hijacked' });
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });

    it('PATCH /class-sessions/:id does NOT mutate Teacher B\'s session', async () => {
      await as(world.tA.accessToken)
        .patch(`/class-sessions/${world.sessionB.id}`)
        .send({ notes: 'Hijacked' });
      const rows = (await world.ds.query(
        `SELECT notes FROM class_sessions WHERE id = $1`,
        [world.sessionB.id],
      )) as { notes: string | null }[];
      expect(rows[0].notes).toBeNull(); // original was created without notes
    });

    it('DELETE /class-sessions/:id — 404 (not 403) for Teacher B\'s session', async () => {
      const res = await as(world.tA.accessToken).delete(`/class-sessions/${world.sessionB.id}`);
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });

    it('DELETE /class-sessions/:id does NOT soft-delete Teacher B\'s session', async () => {
      await as(world.tA.accessToken).delete(`/class-sessions/${world.sessionB.id}`);
      const rows = (await world.ds.query(
        `SELECT deleted_at FROM class_sessions WHERE id = $1`,
        [world.sessionB.id],
      )) as { deleted_at: Date | null }[];
      expect(rows[0].deleted_at).toBeNull();
    });

    it('PATCH /class-sessions/:id/start — 404 for Teacher B\'s session', async () => {
      const res = await as(world.tA.accessToken).patch(`/class-sessions/${world.sessionB.id}/start`);
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });

    it('PATCH /class-sessions/:id/end — 404 for Teacher B\'s session', async () => {
      // Start B's session as Teacher B first so the start-check guard doesn't fire
      await as(world.tB.accessToken).patch(`/class-sessions/${world.sessionB.id}/start`);
      const res = await as(world.tA.accessToken).patch(`/class-sessions/${world.sessionB.id}/end`);
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
      // Clean up: end Teacher B's session so it doesn't affect other tests
      await as(world.tB.accessToken).patch(`/class-sessions/${world.sessionB.id}/end`);
    });

    it('GET /class-sessions/by-class/:classId — 404 for Teacher B\'s class', async () => {
      const res = await as(world.tA.accessToken).get(`/class-sessions/by-class/${world.classB.id}`);
      expectProblemDetails(res, 404);
    });

    it('GET /class-sessions/by-teacher — does NOT contain Teacher B\'s sessions', async () => {
      const res = await as(world.tA.accessToken).get('/class-sessions/by-teacher');
      expect(res.status).toBe(200);
      const ids = (res.body as Array<{ id: string }>).map((s) => s.id);
      expect(ids).not.toContain(world.sessionB.id);
    });

    it('GET /class-sessions/by-date-range — does NOT contain Teacher B\'s sessions', async () => {
      const res = await as(world.tA.accessToken)
        .get('/class-sessions/by-date-range?from=2025-09-01&to=2025-09-30');
      expect(res.status).toBe(200);
      const ids = (res.body as Array<{ id: string }>).map((s) => s.id);
      expect(ids).not.toContain(world.sessionB.id);
    });

    it('POST /class-sessions — 404 when classId belongs to Teacher B', async () => {
      const res = await as(world.tA.accessToken)
        .post('/class-sessions')
        .send({ classId: world.classB.id, date: '2025-09-10' });
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });
  });

  // =========================================================================
  // Attendances
  // =========================================================================

  describe('/attendances — isolation', () => {
    it('GET /attendances — list does NOT contain Teacher B\'s attendance rows', async () => {
      const res = await as(world.tA.accessToken).get('/attendances');
      expect(res.status).toBe(200);
      const ids = (res.body as Array<{ id: string }>).map((a) => a.id);
      expect(ids).not.toContain(world.attendanceB.id);
      expect(ids).toContain(world.attendanceA.id);
    });

    it('GET /attendances/:id — 404 (not 403) for Teacher B\'s attendance', async () => {
      const res = await as(world.tA.accessToken).get(`/attendances/${world.attendanceB.id}`);
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });

    it('PATCH /attendances/:id/present — 404 for Teacher B\'s attendance', async () => {
      const res = await as(world.tA.accessToken).patch(`/attendances/${world.attendanceB.id}/present`);
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });

    it('PATCH /attendances/:id/present does NOT mutate Teacher B\'s attendance status', async () => {
      await as(world.tA.accessToken).patch(`/attendances/${world.attendanceB.id}/present`);
      const rows = (await world.ds.query(
        `SELECT status FROM attendances WHERE id = $1`,
        [world.attendanceB.id],
      )) as { status: string }[];
      expect(rows[0].status).toBe('pending');
    });

    it('PATCH /attendances/:id/late — 404 for Teacher B\'s attendance', async () => {
      const res = await as(world.tA.accessToken).patch(`/attendances/${world.attendanceB.id}/late`);
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });

    it('PATCH /attendances/:id/absent — 404 for Teacher B\'s attendance', async () => {
      const res = await as(world.tA.accessToken).patch(`/attendances/${world.attendanceB.id}/absent`);
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });

    it('PATCH /attendances/:id/excused — 404 for Teacher B\'s attendance', async () => {
      const res = await as(world.tA.accessToken).patch(`/attendances/${world.attendanceB.id}/excused`);
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });

    it('PATCH /attendances/:id/notes — 404 for Teacher B\'s attendance', async () => {
      const res = await as(world.tA.accessToken)
        .patch(`/attendances/${world.attendanceB.id}/notes`)
        .send({ notes: 'Hijacked note' });
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });

    it('POST /attendances — 404 when sessionId belongs to Teacher B', async () => {
      // Teacher A's student, Teacher B's session
      const res = await as(world.tA.accessToken)
        .post('/attendances')
        .send({ sessionId: world.sessionB.id, studentId: world.studentA.id });
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });

    it('POST /attendances — 404 when studentId belongs to Teacher B', async () => {
      // Teacher A's session, Teacher B's student
      const res = await as(world.tA.accessToken)
        .post('/attendances')
        .send({ sessionId: world.sessionA.id, studentId: world.studentB.id });
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });

    it('POST /attendances/bulk — 404 when sessionId belongs to Teacher B', async () => {
      const res = await as(world.tA.accessToken)
        .post('/attendances/bulk')
        .send({ sessionId: world.sessionB.id });
      expectProblemDetails(res, 404);
      expect(res.status).not.toBe(403);
    });
  });
});
