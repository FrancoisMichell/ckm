/**
 * Auth helpers for e2e suites.
 *
 * Centralises the login round-trip and problem+json assertion so each spec
 * does not have to duplicate supertest boilerplate.
 */
import { INestApplication } from '@nestjs/common';
import request, { Response } from 'supertest';

/**
 * Read the throttle-bypass token from the environment and expose it as a
 * pre-formatted header object. Throws at module load if the token is absent so
 * every suite that imports this helper gets a clear error upfront.
 */
export function getSkipThrottleHeader(): Record<string, string> {
  const token = process.env['THROTTLE_TEST_BYPASS_TOKEN'];
  if (!token) {
    throw new Error(
      'THROTTLE_TEST_BYPASS_TOKEN must be set in .env.test (≥16 chars). '
        + 'Import auth.helper.ts only in e2e suites with jest-e2e-setup loaded.',
    );
  }
  return { 'x-test-skip-throttle': token };
}

/**
 * POST /auth/login with throttle-bypass header.
 * Returns the parsed body { access_token, refresh_token } on 200.
 * Throws if the response status is not 200.
 */
export async function login(
  app: INestApplication,
  registry: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const skipThrottle = getSkipThrottleHeader();
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .set(skipThrottle)
    .send({ registry, password });

  if (res.status !== 200) {
    throw new Error(
      `login() expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`,
    );
  }

  return {
    accessToken: res.body.access_token as string,
    refreshToken: res.body.refresh_token as string,
  };
}

/**
 * Assert that a supertest Response carries an RFC 7807 problem+json body.
 *
 * @param res       The supertest Response object.
 * @param status    Expected HTTP status code.
 * @param titleHint Optional substring that must appear in `res.body.title`
 *                  (case-insensitive). When omitted, only content-type +
 *                  status fields are checked.
 */
export function expectProblemDetails(
  res: Response,
  status: number,
  titleHint?: string,
): void {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
  expect(res.body.status).toBe(status);
  expect(typeof res.body.title).toBe('string');
  expect(typeof res.body.detail).toBe('string');
  expect(res.body.type).toMatch(/^https:\/\//);
  if (titleHint) {
    expect(res.body.title.toLowerCase()).toContain(titleHint.toLowerCase());
  }
}

/**
 * Assert that a DB safety guard passes — the test DB name must end with
 * `_test`. Throws if not, preventing accidental wipe of a dev/prod DB.
 */
export function assertTestDatabase(): void {
  const dbName = process.env['DB_NAME'];
  if (!dbName?.endsWith('_test')) {
    throw new Error(
      `Refusing to run e2e against non-test DB: "${dbName}". `
        + 'DB_NAME must end with "_test".',
    );
  }
}
