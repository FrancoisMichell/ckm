import { envValidationSchema } from './configuration';

describe('envValidationSchema', () => {
  const baseValid = {
    NODE_ENV: 'test',
    DB_TYPE: 'postgres',
    DB_HOST: 'localhost',
    DB_PORT: 5433,
    DB_USER: 'ckm',
    DB_PASSWORD: 'ckm',
    DB_NAME: 'ckm_test',
    JWT_SECRET: 'a_secret_that_is_long_enough_for_joi_min_32',
    ALLOWED_ORIGIN: 'http://localhost:5173',
  };

  it('passes when all required fields are present', () => {
    const { error } = envValidationSchema.validate(baseValid, {
      allowUnknown: true,
    });
    expect(error).toBeUndefined();
  });

  it('fails when JWT_SECRET is missing', () => {
    const { JWT_SECRET: _omit, ...withoutSecret } = baseValid;
    const { error } = envValidationSchema.validate(withoutSecret, {
      allowUnknown: true,
    });
    expect(error).toBeDefined();
    expect(error!.message).toContain('JWT_SECRET');
  });

  it('fails when JWT_SECRET is shorter than 32 characters', () => {
    const { error } = envValidationSchema.validate(
      { ...baseValid, JWT_SECRET: 'short' },
      { allowUnknown: true },
    );
    expect(error).toBeDefined();
    expect(error!.message).toContain('JWT_SECRET');
  });

  it('fails when DB_HOST is missing', () => {
    const { DB_HOST: _omit, ...withoutHost } = baseValid;
    const { error } = envValidationSchema.validate(withoutHost, {
      allowUnknown: true,
    });
    expect(error).toBeDefined();
    expect(error!.message).toContain('DB_HOST');
  });

  it('applies NODE_ENV default of development', () => {
    const { NODE_ENV: _omit, ...withoutEnv } = baseValid;
    const { value, error } = envValidationSchema.validate(withoutEnv, {
      allowUnknown: true,
    });
    expect(error).toBeUndefined();
    expect(value.NODE_ENV).toBe('development');
  });

  it('THROTTLE_TEST_BYPASS_TOKEN is optional (production may omit it)', () => {
    const { error } = envValidationSchema.validate(baseValid, {
      allowUnknown: true,
    });
    expect(error).toBeUndefined();
  });

  it('THROTTLE_TEST_BYPASS_TOKEN rejects values shorter than 16 chars', () => {
    const { error } = envValidationSchema.validate(
      { ...baseValid, THROTTLE_TEST_BYPASS_TOKEN: 'short' },
      { allowUnknown: true },
    );
    expect(error).toBeDefined();
    expect(error!.message).toContain('THROTTLE_TEST_BYPASS_TOKEN');
  });

  it('THROTTLE_TEST_BYPASS_TOKEN accepts values ≥16 chars', () => {
    const { error } = envValidationSchema.validate(
      {
        ...baseValid,
        THROTTLE_TEST_BYPASS_TOKEN: 'a_token_of_at_least_16_chars',
      },
      { allowUnknown: true },
    );
    expect(error).toBeUndefined();
  });
});
