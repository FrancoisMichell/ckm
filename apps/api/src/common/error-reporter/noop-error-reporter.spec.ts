import { NoopErrorReporter } from './noop-error-reporter';

describe('NoopErrorReporter', () => {
  let reporter: NoopErrorReporter;

  beforeEach(() => {
    reporter = new NoopErrorReporter();
  });

  it('captureException() returns void (undefined)', () => {
    const result = reporter.captureException(new Error('test error'));
    expect(result).toBeUndefined();
  });

  it('captureException() is a no-op — does not throw', () => {
    expect(() => {
      reporter.captureException(new Error('any error'), { path: '/test' });
    }).not.toThrow();
  });

  it('captureException() accepts any error type without throwing', () => {
    expect(() => reporter.captureException('string error')).not.toThrow();
    expect(() => reporter.captureException(null)).not.toThrow();
    expect(() => reporter.captureException(undefined)).not.toThrow();
    expect(() => reporter.captureException({ code: 42 })).not.toThrow();
  });

  it('captureException() with context does not throw', () => {
    expect(() => {
      reporter.captureException(new Error('ctx error'), {
        path: '/api/users',
        userId: 'u-123',
      });
    }).not.toThrow();
  });
});
