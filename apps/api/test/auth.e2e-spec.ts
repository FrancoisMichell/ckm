/**
 * E2E tests for the auth surface (M3b §3b.7).
 *
 * Runs against postgres-test (port 5433, DB ckm_test).
 * Gates covered (per docs/plan.md §3b.7):
 *   - 200 on valid login (returns access + refresh; no password / deletedAt /
 *     tokenHash / lookupHash leak in any response body).
 *   - 401 on bad credentials with RFC 7807 application/problem+json body.
 *   - 401 after logout (refresh token no longer accepted).
 *   - Family revocation on refresh-token replay (consumed token presented
 *     again revokes every row sharing the family).
 *   - 429 after exceeding the throttler limit on POST /auth/login (5/60s).
 *
 * Throttler isolation:
 *   Every non-throttler test sends `x-test-skip-throttle: <token>` where
 *   `<token>` is THROTTLE_TEST_BYPASS_TOKEN from .env.test. AppModule wires
 *   `skipIf` to honour the header only when (a) NODE_ENV === 'test' AND
 *   (b) the header value matches the configured bypass token. The token is
 *   unset in production deploys, which makes the header inert there even
 *   if NODE_ENV is misconfigured. The dedicated 429 test omits the header
 *   to exercise the real 5/60s cap on /auth/login.
 *
 * Run with: pnpm --filter api test:e2e
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Belt, UserRoleType } from '@ckm/contracts';
import { JwtService } from '@nestjs/jwt';
import { createTestApp } from './app.e2e-helper';
import { UsersService } from '@/users/users.service';

// Header value is read at module load (post jest-e2e-setup, which loads
// .env.test before any test file). If the token is missing, fail loudly so
// the test suite cannot accidentally rely on a defaulted bypass value.
const BYPASS_TOKEN = process.env['THROTTLE_TEST_BYPASS_TOKEN'];
if (!BYPASS_TOKEN) {
  throw new Error(
    'THROTTLE_TEST_BYPASS_TOKEN must be set in .env.test (≥16 chars) for the auth e2e suite.',
  );
}
const SKIP_THROTTLE = { 'x-test-skip-throttle': BYPASS_TOKEN } as const;

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let usersService: UsersService;

  // Each test seeds its own teacher to avoid cross-test bleed via the unique
  // registry constraint and to keep refresh-token rows scoped per case.
  let teacherCounter = 0;
  const nextRegistry = (): string => {
    teacherCounter += 1;
    return `AUTH${String(teacherCounter).padStart(4, '0')}`;
  };

  async function seedTeacher(
    registry: string,
    password = 'correct-horse-battery-staple',
  ): Promise<{ id: string; registry: string; password: string }> {
    const user = await usersService.create(
      { name: `Teacher ${registry}`, registry, password, belt: Belt.BLACK },
      [UserRoleType.TEACHER],
    );
    if (!user) throw new Error(`Failed to seed teacher ${registry}`);
    return { id: user.id, registry, password };
  }

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

    // Apply migrations to the test DB (idempotent).
    await ds.runMigrations();
  }, 60_000);

  afterEach(async () => {
    // refresh_tokens cascades from users on delete; clearing users wipes both.
    await ds.query('DELETE FROM "refresh_tokens"');
    await ds.query('DELETE FROM "users"');
  });

  afterAll(async () => {
    await ds.query('DELETE FROM "refresh_tokens"');
    await ds.query('DELETE FROM "users"');
    await app.close();
  }, 15_000);

  // -------------------------------------------------------------------------
  // 1. POST /auth/login — 200 on valid credentials
  // -------------------------------------------------------------------------

  describe('POST /auth/login — valid credentials', () => {
    it('returns 200 with access_token + refresh_token, no sensitive fields leaked', async () => {
      const teacher = await seedTeacher(nextRegistry());

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set(SKIP_THROTTLE)
        .send({ registry: teacher.registry, password: teacher.password });

      expect(res.status).toBe(200);
      expect(res.body.access_token).toEqual(expect.any(String));
      expect(res.body.refresh_token).toEqual(expect.any(String));
      // Access token must be a real JWT (header.payload.signature).
      expect((res.body.access_token as string).split('.')).toHaveLength(3);
      // Refresh token must be opaque base64url (no dots).
      expect(res.body.refresh_token).not.toContain('.');

      // Sensitive fields must never appear in any response body.
      const wholeBody = JSON.stringify(res.body);
      expect(wholeBody).not.toMatch(/"password"/);
      expect(wholeBody).not.toMatch(/"deletedAt"/);
      expect(wholeBody).not.toMatch(/"tokenHash"/);
      expect(wholeBody).not.toMatch(/"lookupHash"/);
      expect(wholeBody).not.toMatch(/"token_hash"/);
      expect(wholeBody).not.toMatch(/"lookup_hash"/);
    });

    it('GET /auth/me with no Authorization header returns 401 problem+json', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set(SKIP_THROTTLE);

      expect(res.status).toBe(401);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.body.status).toBe(401);
      expect(typeof res.body.title).toBe('string');
      expect(res.body.instance).toBe('/auth/me');
      expect(res.body.type).toMatch(/^https:\/\/api\.ckm\.dev\/problems\//);
    });

    it('GET /auth/me with a malformed/tampered JWT returns 401 problem+json', async () => {
      // First: completely malformed token — passport-jwt rejects on parse.
      const malformed = await request(app.getHttpServer())
        .get('/auth/me')
        .set(SKIP_THROTTLE)
        .set('Authorization', 'Bearer not.a.jwt');

      expect(malformed.status).toBe(401);
      expect(malformed.headers['content-type']).toMatch(
        /application\/problem\+json/,
      );
      expect(malformed.body.status).toBe(401);

      // Second: structurally valid JWT with its signature mutated — passport-jwt
      // rejects on signature verification against the configured secret.
      const teacher = await seedTeacher(nextRegistry());
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .set(SKIP_THROTTLE)
        .send({ registry: teacher.registry, password: teacher.password });
      expect(login.status).toBe(200);
      const goodToken = login.body.access_token as string;
      const [header, payload, signature] = goodToken.split('.');
      // Flip the last char of the signature to break verification while
      // keeping the JWT structurally valid (header.payload.signature).
      const lastChar = signature.slice(-1);
      const flipped = lastChar === 'A' ? 'B' : 'A';
      const tampered = `${header}.${payload}.${signature.slice(0, -1)}${flipped}`;

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${tampered}`);

      expect(res.status).toBe(401);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.body.status).toBe(401);
      expect(res.body.instance).toBe('/auth/me');
    });

    it('GET /auth/me echoes the JWT payload without leaking sensitive fields', async () => {
      const teacher = await seedTeacher(nextRegistry());

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .set(SKIP_THROTTLE)
        .send({ registry: teacher.registry, password: teacher.password });
      expect(login.status).toBe(200);

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${login.body.access_token as string}`);

      expect(me.status).toBe(200);
      expect(me.body.id).toBe(teacher.id);
      expect(me.body.registry).toBe(teacher.registry);
      expect(me.body.roles).toEqual(
        expect.arrayContaining([UserRoleType.TEACHER]),
      );
      const wholeBody = JSON.stringify(me.body);
      expect(wholeBody).not.toMatch(/"password"/);
      expect(wholeBody).not.toMatch(/"deletedAt"/);
    });
  });

  // -------------------------------------------------------------------------
  // 2. POST /auth/login — 401 with problem+json on bad credentials
  // -------------------------------------------------------------------------

  describe('POST /auth/login — bad credentials', () => {
    it('returns 401 with application/problem+json on wrong password', async () => {
      const teacher = await seedTeacher(nextRegistry());

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set(SKIP_THROTTLE)
        .send({ registry: teacher.registry, password: 'wrong-password' });

      expect(res.status).toBe(401);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.body.status).toBe(401);
      expect(typeof res.body.title).toBe('string');
      expect(typeof res.body.detail).toBe('string');
      expect(res.body.instance).toBe('/auth/login');
      expect(res.body.type).toMatch(/^https:\/\/api\.ckm\.dev\/problems\//);
    });

    it('returns 401 with application/problem+json on unknown registry', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set(SKIP_THROTTLE)
        .send({ registry: 'DOES_NOT_EXIST', password: 'whatever' });

      expect(res.status).toBe(401);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.body.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // 3. POST /auth/logout — refresh token rejected after logout
  // -------------------------------------------------------------------------

  describe('POST /auth/logout', () => {
    it('revokes the refresh token; subsequent /auth/refresh returns 401', async () => {
      const teacher = await seedTeacher(nextRegistry());

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .set(SKIP_THROTTLE)
        .send({ registry: teacher.registry, password: teacher.password });
      expect(login.status).toBe(200);
      const refreshToken = login.body.refresh_token as string;
      const accessToken = login.body.access_token as string;

      const logout = await request(app.getHttpServer())
        .post('/auth/logout')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refresh_token: refreshToken });
      expect(logout.status).toBe(204);

      // The (now revoked) refresh token must be rejected.
      const refresh = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set(SKIP_THROTTLE)
        .send({ refresh_token: refreshToken });

      expect(refresh.status).toBe(401);
      expect(refresh.headers['content-type']).toMatch(
        /application\/problem\+json/,
      );
    });
  });

  // -------------------------------------------------------------------------
  // 4. POST /auth/refresh — family revocation on replay
  // -------------------------------------------------------------------------

  describe('POST /auth/refresh — replay revokes the family', () => {
    it('rotates once, then presenting the consumed token again revokes every row in the family', async () => {
      const teacher = await seedTeacher(nextRegistry());

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .set(SKIP_THROTTLE)
        .send({ registry: teacher.registry, password: teacher.password });
      expect(login.status).toBe(200);
      const firstRefresh = login.body.refresh_token as string;

      // First rotation — succeeds, issues a new refresh token in the same family.
      const rotate1 = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set(SKIP_THROTTLE)
        .send({ refresh_token: firstRefresh });
      expect(rotate1.status).toBe(200);
      const secondRefresh = rotate1.body.refresh_token as string;
      expect(secondRefresh).not.toBe(firstRefresh);

      // REPLAY — present the already-consumed first token. Must 401 and
      // must revoke the entire family (including the still-active second).
      const replay = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set(SKIP_THROTTLE)
        .send({ refresh_token: firstRefresh });
      expect(replay.status).toBe(401);
      expect(replay.headers['content-type']).toMatch(
        /application\/problem\+json/,
      );

      // The successor token (which the rotation issued) must now also fail —
      // family revocation neutralises every row, not just the replayed one.
      const successor = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set(SKIP_THROTTLE)
        .send({ refresh_token: secondRefresh });
      expect(successor.status).toBe(401);

      // DB-level invariant: every row in the family is marked revoked.
      const rows = (await ds.query(
        `SELECT revoked FROM refresh_tokens WHERE user_id = $1`,
        [teacher.id],
      )) as { revoked: boolean }[];
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows.every((r) => r.revoked === true)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 5. JWT expiry — expired access token → 401
  // -------------------------------------------------------------------------

  describe('JWT expiry', () => {
    it('presents an expired access token to a protected endpoint → 401 problem+json', async () => {
      const teacher = await seedTeacher(nextRegistry());

      // Forge an immediately-expired token using the JwtService configured for
      // this app, with the same secret but expiresIn=0 (expires immediately).
      const jwtService = app.get(JwtService);
      const expiredToken = jwtService.sign(
        {
          sub: teacher.id,
          username: teacher.registry,
          name: `Teacher ${teacher.registry}`,
          roles: ['teacher'],
        },
        { expiresIn: 0 },
      );

      // Tiny delay ensures the token's `exp` claim is in the past before we use it.
      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set(SKIP_THROTTLE)
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(res.body.status).toBe(401);
      expect(res.body.instance).toBe('/auth/me');
    });
  });

  // -------------------------------------------------------------------------
  // 6. POST /auth/login — 429 after exceeding throttler limit (5/60s)
  // -------------------------------------------------------------------------
  //
  // Must run last in the file: it intentionally omits the skip-throttle
  // header so it can exhaust the 5/60s budget against /auth/login. Earlier
  // tests in this file all skip the throttler so their attempts do not
  // contribute to this test's counter.
  //
  describe('POST /auth/login — rate limit (5 requests / 60s)', () => {
    it('returns 429 after the 6th attempt within the window', async () => {
      // Use a deliberately bad-credential payload so successful logins do not
      // pollute the DB; throttler runs before LocalAuthGuard's credential
      // check on Nest's guard chain order, so even invalid attempts count.
      const payload = { registry: 'TROTTLE_TEST', password: 'nope' };
      const statuses: number[] = [];

      for (let i = 0; i < 6; i += 1) {
        // Sequential calls — must NOT parallelise; the throttler counter
        // must observe ordered hits so the 6th request is the one blocked.
        const res = await request(app.getHttpServer())
          .post('/auth/login')
          .send(payload);
        statuses.push(res.status);
      }

      // First 5 attempts: 401 (bad creds), allowed through.
      expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
      // 6th attempt: blocked by ThrottlerGuard.
      expect(statuses[5]).toBe(429);
    }, 20_000);
  });
});
