/**
 * E2E tests for the health endpoint (M8 §8.1).
 *
 * Runs against postgres-test (port 5433, DB ckm_test).
 * Gates covered:
 *   - GET /health returns 200 with { status: 'ok', ... }
 *   - GET /health is publicly accessible — no Authorization header required
 *
 * Run with: pnpm --filter api test:e2e
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
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
