/**
 * E2E tests for the health endpoint (M8 §8.1, M9 deferred B4 fix).
 *
 * Runs against postgres-test (port 5433, DB ckm_test).
 * Gates covered:
 *   - GET /health returns 200 with { status: 'ok', ... }
 *   - GET /health is publicly accessible — no Authorization header required
 *   - GET /health returns 503 when DB is unreachable (B4 fix from M8 audit)
 *
 * Run with: pnpm --filter api test:e2e
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { HealthCheckError, TypeOrmHealthIndicator } from '@nestjs/terminus';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '@/app.module';
import { setupApp } from '@/common/setup-app';
import { NoopErrorReporter } from '@/common/error-reporter/noop-error-reporter';
import { createTestApp } from './app.e2e-helper';

describe('Health (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());
  });

  afterAll(async () => {
    await ds.destroy();
    await app.close();
  });

  it('GET /health → 200 with status ok (no auth required)', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(res.body).toMatchObject({ status: 'ok' });
    expect(res.body.info).toBeDefined();
    expect(res.body.info.database).toBeDefined();
  });

  it('GET /health returns database indicator as up', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(res.body.info.database.status).toBe('up');
  });
});

// ---------------------------------------------------------------------------
// 503 failure-path test (B4 from M8 audit).
//
// TypeOrmHealthIndicator is a scoped provider and cannot be retrieved with
// app.get(). Instead we override the module at compile-time by providing a
// mock indicator that always throws, simulating a DB-unreachable scenario
// without actually disconnecting the test DB connection.
// ---------------------------------------------------------------------------
describe('Health failure path (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    // Build a fake indicator whose pingCheck always throws a HealthCheckError.
    // This must be a HealthCheckError (not a raw Error) so Terminus's
    // HealthCheckService.check() converts it to a 503 response rather than
    // letting it propagate as an unhandled 500 through the exception filter.
    const mockIndicator = {
      pingCheck: jest.fn().mockRejectedValue(
        new HealthCheckError('Database check failed', {
          database: { status: 'down', message: 'Connection refused' },
        }),
      ),
    } as unknown as TypeOrmHealthIndicator;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TypeOrmHealthIndicator)
      .useValue(mockIndicator)
      .compile();

    app = moduleRef.createNestApplication();
    setupApp(app, new NoopErrorReporter(), 'http://localhost:5173');
    await app.init();

    ds = moduleRef.get<DataSource>(getDataSourceToken());
    await ds.runMigrations();
  }, 60_000);

  afterAll(async () => {
    await ds.destroy();
    await app.close();
  }, 15_000);

  it('GET /health → 503 with problem+json body when DB is unreachable', async () => {
    const res = await request(app.getHttpServer())
      .get('/health');

    // Terminus's HealthCheckError is caught by NestJS and converted to a
    // ServiceUnavailableException (503). Our ProblemDetailsExceptionFilter
    // then serialises it as application/problem+json — so the body has the
    // RFC 7807 shape rather than Terminus's default { status: 'error' } shape.
    expect(res.status).toBe(503);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    // RFC 7807 requires `status` to equal the HTTP status code (number).
    expect(res.body.status).toBe(503);
    expect(typeof res.body.title).toBe('string');
    expect(res.body.instance).toBe('/health');
  });
});
