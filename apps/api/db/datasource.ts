import { config } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as path from 'path';

const isTest = process.env['NODE_ENV'] === 'test';

// override: false (default) so env vars already present in the process win over
// the dotenv file. This lets CI inject DB_PORT=5432 (the service-container port)
// while .env.test pins 5433 for local runs against postgres-test. With
// override: true the file would clobber the CI value and the migration step
// would connect to 5433 (ECONNREFUSED in CI). Mirrors test/jest-e2e-setup.ts.
config({
  path: path.resolve(__dirname, isTest ? '../.env.test' : '../.env'),
});

export const datasourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env['DB_HOST']!,
  port: +(process.env['DB_PORT'] ?? 5432),
  username: process.env['DB_USER']!,
  password: process.env['DB_PASSWORD']!,
  database: process.env['DB_NAME']!,
  entities: isTest ? ['src/**/*.entity.ts'] : ['dist/**/*.entity.js'],
  migrations: isTest ? ['db/migrations/*.ts'] : ['dist/db/migrations/*.js'],
  migrationsTableName: 'migrations',
  migrationsRun: false,
  synchronize: false,
  logging: process.env['DB_LOGGING'] === 'true',
  extra: { max: 10 },
};

export default new DataSource(datasourceOptions);
