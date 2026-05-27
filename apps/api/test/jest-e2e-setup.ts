/**
 * Global setup for e2e tests.
 * Loads .env.test before the test suite runs.
 * NODE_ENV is set to 'test' so datasource.ts also picks up .env.test.
 *
 * `override: true` ensures .env.test values win over any stale system env
 * vars on a developer's machine. In CI the workflow `env:` block sets vars
 * before Jest starts, which means process.env already contains those values
 * before dotenv runs. Since dotenv applies in the same process as the tests,
 * the CI env vars are still in process.env at the point NestJS bootstraps —
 * both CI overrides and .env.test defaults are available; the CI values set
 * before Jest starts take precedence when they coincide with .env.test keys
 * because process.env is mutated in place and the CI values were written
 * directly by the GitHub Actions runner, not by dotenv.
 *
 * Practical effect: DB_PORT=5432 (from CI workflow env) is already in
 * process.env before Jest loads this setup file. When dotenv runs with
 * `override: true` it would overwrite that with DB_PORT=5433. To prevent
 * this, CI must export DB_PORT AFTER dotenv loads — which it does, since the
 * workflow `env:` block applies at step start, before `run:` executes.
 * However, dotenv with `override: true` would clobber it. Therefore we use
 * the default `override: false` for CI compatibility while keeping the file
 * as the canonical source for local runs where no env vars are pre-set.
 */
import * as path from 'path';
import { config } from 'dotenv';

// Load test env vars before NestJS configuration bootstraps.
// override: false (default) lets CI workflow env vars take precedence
// over .env.test values (e.g. DB_PORT=5432 in CI vs 5433 locally).
config({
  path: path.resolve(__dirname, '../.env.test'),
});
