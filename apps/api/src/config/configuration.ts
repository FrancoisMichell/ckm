import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),
  RUN_MIGRATIONS: Joi.boolean().default(true),
  ALLOWED_ORIGIN: Joi.string().required(),

  DB_TYPE: Joi.string().valid('postgres').required(),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_LOGGING: Joi.boolean().default(false),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: Joi.number().default(30),
  BCRYPT_SALT_ROUNDS: Joi.number().default(10),

  SWAGGER_ENABLED: Joi.boolean().default(true),
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug', 'trace')
    .default('info'),

  // Optional per-deploy secret that the e2e helper uses to bypass the
  // ThrottlerGuard for setup/teardown traffic. Must be ≥16 chars when set.
  // Absent in production (and in any deploy that does not set it), which
  // makes the bypass header inert there — fail-closed.
  THROTTLE_TEST_BYPASS_TOKEN: Joi.string().min(16).optional(),
});

export default () => ({
  app: {
    nodeEnv: process.env['NODE_ENV'],
    port: +(process.env['PORT'] ?? 3000),
    runMigrations: process.env['RUN_MIGRATIONS'] === 'true',
    allowedOrigin: process.env['ALLOWED_ORIGIN'],
  },
  database: {
    type: process.env['DB_TYPE'],
    host: process.env['DB_HOST'],
    port: +(process.env['DB_PORT'] ?? 5432),
    user: process.env['DB_USER'],
    password: process.env['DB_PASSWORD'],
    name: process.env['DB_NAME'],
    logging: process.env['DB_LOGGING'] === 'true',
  },
  jwt: {
    secret: process.env['JWT_SECRET'],
    accessTtl: process.env['JWT_ACCESS_TTL'] ?? '15m',
    refreshTtlDays: +(process.env['JWT_REFRESH_TTL_DAYS'] ?? 30),
  },
  security: {
    bcryptSaltRounds: +(process.env['BCRYPT_SALT_ROUNDS'] ?? 10),
  },
  features: {
    swaggerEnabled: process.env['SWAGGER_ENABLED'] === 'true',
  },
  logging: {
    level: process.env['LOG_LEVEL'] ?? 'info',
  },
  throttle: {
    // Test-only bypass token. Reads as undefined in production, which the
    // ThrottlerModule.skipIf callback treats as fail-closed.
    testBypassToken: process.env['THROTTLE_TEST_BYPASS_TOKEN'],
  },
});
