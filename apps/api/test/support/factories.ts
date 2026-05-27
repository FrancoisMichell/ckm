/**
 * Entity factory builders for e2e suites.
 *
 * Creates resources via HTTP (the same path a real client would use), so every
 * factory exercises the full request pipeline including guards and interceptors.
 *
 * Factories are NOT stateless — they increment a module-level counter to
 * produce unique registry values. Re-importing this module in the same Jest
 * worker does NOT reset the counter because Jest caches modules; that is
 * intentional: each suite gets a monotonically increasing sequence.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Belt, UserRoleType } from '@ckm/contracts';
import { getSkipThrottleHeader, login } from './auth.helper';
import { UsersService } from '@/users/users.service';

// ---------------------------------------------------------------------------
// Registry counter — prefix-namespaced to avoid collisions across suites when
// multiple test files are required in the same Jest worker.
// ---------------------------------------------------------------------------

let counter = 0;

/**
 * Returns a unique registry string for the given prefix.
 * Example: nextReg('T') → 'T00001', 'T00002', …
 */
export function nextReg(prefix = 'F'): string {
  counter += 1;
  return `${prefix}${String(counter).padStart(5, '0')}`;
}

// ---------------------------------------------------------------------------
// Teacher factory
// ---------------------------------------------------------------------------

export interface TeacherCtx {
  id: string;
  registry: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * Seeds a TEACHER user (via UsersService, which bypasses HTTP for speed) and
 * immediately logs in to obtain a valid access + refresh token pair.
 *
 * @param app          The running NestJS application instance.
 * @param usersService The UsersService obtained from the app's DI container.
 */
export async function createTeacher(
  app: INestApplication,
  usersService: UsersService,
  overrides: { name?: string; belt?: Belt } = {},
): Promise<TeacherCtx> {
  const registry = nextReg('T');
  const password = 'correct-horse-battery-staple';
  const user = await usersService.create(
    {
      name: overrides.name ?? `Teacher ${registry}`,
      registry,
      password,
      belt: overrides.belt ?? Belt.BLACK,
    },
    [UserRoleType.TEACHER],
  );
  if (!user) throw new Error(`createTeacher: failed to seed teacher ${registry}`);

  const { accessToken, refreshToken } = await login(app, registry, password);

  return { id: user.id, registry, password, accessToken, refreshToken };
}

// ---------------------------------------------------------------------------
// Student factory
// ---------------------------------------------------------------------------

export interface StudentCtx {
  id: string;
}

/**
 * Creates a student under a teacher via POST /students.
 * The student is owned by the teacher whose token is provided.
 */
export async function createStudent(
  app: INestApplication,
  teacherToken: string,
  overrides: { name?: string; belt?: Belt } = {},
): Promise<StudentCtx> {
  const skipThrottle = getSkipThrottleHeader();
  const res = await request(app.getHttpServer())
    .post('/students')
    .set(skipThrottle)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      name: overrides.name ?? `Student ${nextReg('S')}`,
      registry: nextReg(),
      belt: overrides.belt ?? Belt.WHITE,
    });
  if (res.status !== 201) {
    throw new Error(
      `createStudent: expected 201 but got ${res.status}: ${JSON.stringify(res.body)}`,
    );
  }
  return { id: res.body.id as string };
}

// ---------------------------------------------------------------------------
// Class factory
// ---------------------------------------------------------------------------

export interface ClassCtx {
  id: string;
}

/**
 * Creates a class owned by the teacher whose token is provided.
 */
export async function createClass(
  app: INestApplication,
  teacherToken: string,
  overrides: { name?: string; durationMinutes?: number } = {},
): Promise<ClassCtx> {
  const skipThrottle = getSkipThrottleHeader();
  const res = await request(app.getHttpServer())
    .post('/classes')
    .set(skipThrottle)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      name: overrides.name ?? `Turma ${nextReg('CL')}`,
      days: ['monday', 'wednesday'],
      startTime: '08:00',
      durationMinutes: overrides.durationMinutes ?? 60,
      belt: Belt.WHITE,
    });
  if (res.status !== 201) {
    throw new Error(
      `createClass: expected 201 but got ${res.status}: ${JSON.stringify(res.body)}`,
    );
  }
  return { id: res.body.id as string };
}

// ---------------------------------------------------------------------------
// Class enrollment factory
// ---------------------------------------------------------------------------

/**
 * Enrolls a student in a class.
 */
export async function enrollStudent(
  app: INestApplication,
  teacherToken: string,
  classId: string,
  studentId: string,
): Promise<void> {
  const skipThrottle = getSkipThrottleHeader();
  const res = await request(app.getHttpServer())
    .post(`/classes/${classId}/enrollments`)
    .set(skipThrottle)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ studentId });
  if (res.status !== 201) {
    throw new Error(
      `enrollStudent: expected 201 but got ${res.status}: ${JSON.stringify(res.body)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Class session factory
// ---------------------------------------------------------------------------

export interface SessionCtx {
  id: string;
}

/**
 * Creates a class session for the given class.
 */
export async function createSession(
  app: INestApplication,
  teacherToken: string,
  classId: string,
  date: string,
  notes?: string,
): Promise<SessionCtx> {
  const skipThrottle = getSkipThrottleHeader();
  const res = await request(app.getHttpServer())
    .post('/class-sessions')
    .set(skipThrottle)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ classId, date, ...(notes ? { notes } : {}) });
  if (res.status !== 201) {
    throw new Error(
      `createSession: expected 201 but got ${res.status}: ${JSON.stringify(res.body)}`,
    );
  }
  return { id: res.body.id as string };
}

// ---------------------------------------------------------------------------
// Attendance factory
// ---------------------------------------------------------------------------

export interface AttendanceCtx {
  id: string;
}

/**
 * Creates a single attendance record.
 */
export async function createAttendance(
  app: INestApplication,
  teacherToken: string,
  sessionId: string,
  studentId: string,
): Promise<AttendanceCtx> {
  const skipThrottle = getSkipThrottleHeader();
  const res = await request(app.getHttpServer())
    .post('/attendances')
    .set(skipThrottle)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ sessionId, studentId });
  if (res.status !== 201) {
    throw new Error(
      `createAttendance: expected 201 but got ${res.status}: ${JSON.stringify(res.body)}`,
    );
  }
  return { id: res.body.id as string };
}
