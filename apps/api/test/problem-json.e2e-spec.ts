/**
 * E2E tests for RFC 7807 problem+json response shapes (M9 §9.5).
 *
 * Runs against postgres-test (port 5433, DB ckm_test).
 * Gates covered (per docs/plan.md §9.5):
 *   1. 422 validation error shape — `errors[]` array with field+message pairs.
 *   2. 404 unknown route — problem+json with correct type/instance fields.
 *   3. 500 with ErrorReporter.captureException spy — unhandled error reported once.
 *
 * Run with: pnpm --filter api test:e2e -- --testPathPattern=problem-json
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Belt, UserRoleType } from '@ckm/contracts';
import { createTestApp } from './app.e2e-helper';
import { StudentsService } from '@/students/students.service';
import { NoopErrorReporter } from '@/common/error-reporter/noop-error-reporter';
import { UsersService } from '@/users/users.service';

const BYPASS_TOKEN = process.env['THROTTLE_TEST_BYPASS_TOKEN'];
if (!BYPASS_TOKEN) {
  throw new Error(
    'THROTTLE_TEST_BYPASS_TOKEN must be set in .env.test (≥16 chars) for the problem-json e2e suite.',
  );
}
const SKIP_THROTTLE = { 'x-test-skip-throttle': BYPASS_TOKEN } as const;

const PROBLEM_TYPE_PREFIX = 'https://api.ckm.dev/problems/';

describe('Problem+JSON shapes (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let accessToken: string;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());

    // Apply migrations to the test DB (idempotent — safe to run on every suite).
    await ds.runMigrations();

    // Clean up any stale data from a prior aborted run.
    await ds.query('DELETE FROM "users" WHERE registry LIKE \'PJ%\'');

    // Seed a teacher and log in to obtain a valid access token used in tests
    // that need an authenticated context to reach a service endpoint.
    const usersService = app.get(UsersService);
    const registry = 'PJ00001';
    const password = 'correct-horse-battery-staple';
    await usersService.create(
      { name: 'ProblemJson Teacher', registry, password, belt: Belt.BLACK },
      [UserRoleType.TEACHER],
    );

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .set(SKIP_THROTTLE)
      .send({ registry, password });

    if (loginRes.status !== 200) {
      throw new Error(
        `problem-json beforeAll: login failed with ${loginRes.status}: ${JSON.stringify(loginRes.body)}`,
      );
    }
    accessToken = loginRes.body.access_token as string;
  }, 60_000);

  afterAll(async () => {
    await ds.query('DELETE FROM "users"');
    await ds.destroy();
    await app.close();
  }, 15_000);

  // -------------------------------------------------------------------------
  // Case 1: 422 validation error shape
  // -------------------------------------------------------------------------

  it('POST /students with empty body → 422 with errors[] array', async () => {
    const res = await request(app.getHttpServer())
      .post('/students')
      .set(SKIP_THROTTLE)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(422);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body.status).toBe(422);
    expect(res.body.type).toMatch(new RegExp(`^${PROBLEM_TYPE_PREFIX}`));
    expect(res.body.instance).toBe('/students');

    // errors[] must be a non-empty array
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect((res.body.errors as unknown[]).length).toBeGreaterThan(0);

    // Each element must have { field: string, message: string }
    for (const err of res.body.errors as Array<unknown>) {
      expect(err).toMatchObject({
        field: expect.any(String) as unknown,
        message: expect.any(String) as unknown,
      });
    }
  });

  // -------------------------------------------------------------------------
  // Case 2: 404 unknown route
  // -------------------------------------------------------------------------

  it('GET /this-route-does-not-exist-9999 → 404 problem+json', async () => {
    const path = '/this-route-does-not-exist-9999';
    const res = await request(app.getHttpServer()).get(path);

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body.status).toBe(404);
    expect(res.body.type).toMatch(new RegExp(`^${PROBLEM_TYPE_PREFIX}`));
    expect(res.body.instance).toBe(path);
  });

  // -------------------------------------------------------------------------
  // Case 3: 500 with ErrorReporter.captureException spy
  // -------------------------------------------------------------------------

  it('GET /students with a service method that throws raw Error → 500 + captureException once', async () => {
    // The ErrorReporter token is the string 'ErrorReporter' (see error-reporter.module.ts).
    // The NoopErrorReporter constructed in setupApp() is NOT the DI-provided instance;
    // it's a separate object. The ProblemDetailsExceptionFilter, however, is instantiated
    // with the NoopErrorReporter passed to setupApp() in createTestApp(). To spy on
    // captureException we need to intercept that specific instance.
    //
    // Strategy: spy on StudentsService.findAll to throw a raw Error, triggering
    // the catch-all path in ProblemDetailsExceptionFilter. The filter calls
    // this.reporter.captureException(...). Since the reporter is a NoopErrorReporter
    // instantiated in setupApp(), we cannot reach it via DI. Instead we spy on the
    // prototype so all instances are covered.
    const spy = jest
      .spyOn(NoopErrorReporter.prototype, 'captureException')
      .mockImplementationOnce(() => { /* no-op spy */ });

    const studentsService = app.get(StudentsService);
    const serviceSpy = jest
      .spyOn(studentsService, 'findAll')
      .mockRejectedValueOnce(new Error('boom — simulated unexpected error'));

    try {
      const res = await request(app.getHttpServer())
        .get('/students')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(500);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.body.status).toBe(500);
      expect(res.body.type).toMatch(new RegExp(`^${PROBLEM_TYPE_PREFIX}`));
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
      serviceSpy.mockRestore();
    }
  });
});
