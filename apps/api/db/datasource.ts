import { config } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as path from 'path';

const isTest = process.env['NODE_ENV'] === 'test';

config({
  path: path.resolve(__dirname, isTest ? '../.env.test' : '../.env'),
  override: true,
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
