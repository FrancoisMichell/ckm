import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),
  RUN_MIGRATIONS: Joi.boolean().default(true),

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
});

export default () => ({
  app: {
    nodeEnv: process.env['NODE_ENV'],
    port: +(process.env['PORT'] ?? 3000),
    runMigrations: process.env['RUN_MIGRATIONS'] === 'true',
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
});
