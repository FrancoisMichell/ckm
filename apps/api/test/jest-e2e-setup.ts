/**
 * Global setup for e2e tests.
 * Loads .env.test before the test suite runs.
 * NODE_ENV is set to 'test' so datasource.ts also picks up .env.test.
 */
import * as path from 'path';
import { config } from 'dotenv';

// Load test env vars before NestJS configuration bootstraps
config({
  path: path.resolve(__dirname, '../.env.test'),
  override: true,
});
