import { QueryFailedError } from 'typeorm';
import { QueryFailedErrorFilter } from './query-failed-error.filter';
import { NoopErrorReporter } from '../error-reporter/noop-error-reporter';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function buildQueryFailedError(constraint?: string): QueryFailedError {
  const err = Object.create(QueryFailedError.prototype) as QueryFailedError;
  // TypeORM's QueryFailedError stores driver-specific info in driverError
  (err as any).driverError = { constraint };
  (err as any).message = 'error: duplicate key value violates unique constraint';
  return err;
}

function buildMockHost(url = '/test') {
  const json = jest.fn();
  const type = jest.fn().mockReturnValue({ json });
  const status = jest.fn().mockReturnValue({ type });

  const res = { status };
  const req = { url };

  return {
    host: {
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => req,
      }),
    } as any,
    statusMock: status,
    typeMock: type,
    jsonMock: json,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QueryFailedErrorFilter', () => {
  let filter: QueryFailedErrorFilter;
  let reporter: NoopErrorReporter;

  beforeEach(() => {
    reporter = new NoopErrorReporter();
    filter = new QueryFailedErrorFilter(reporter);
  });

  describe('unknown constraint → 500', () => {
    it('returns 500 for a constraint not in the map', () => {
      const { host, statusMock, jsonMock } = buildMockHost('/api/users');
      const err = buildQueryFailedError('uq_unknown_constraint');

      filter.catch(err, host);

      expect(statusMock).toHaveBeenCalledWith(500);
      const body = jsonMock.mock.calls[0][0];
      expect(body.status).toBe(500);
      expect(body.title).toBe('Internal Server Error');
    });

    it('returns 500 when driverError has no constraint property', () => {
      const { host, statusMock } = buildMockHost();
      const err = buildQueryFailedError(undefined);

      filter.catch(err, host);

      expect(statusMock).toHaveBeenCalledWith(500);
    });

    it('calls reporter.captureException for unknown constraints', () => {
      const { host } = buildMockHost();
      const captureExceptionSpy = jest.spyOn(reporter, 'captureException');
      const err = buildQueryFailedError('uq_mystery');

      filter.catch(err, host);

      expect(captureExceptionSpy).toHaveBeenCalledWith(
        err,
        expect.objectContaining({ constraint: 'uq_mystery' }),
      );
    });

    it('emits application/problem+json content type for unknown constraint', () => {
      const { host, typeMock } = buildMockHost();
      const err = buildQueryFailedError('uq_none');

      filter.catch(err, host);

      expect(typeMock).toHaveBeenCalledWith('application/problem+json');
    });

    it('response includes type, title, status, detail, instance', () => {
      const { host, jsonMock } = buildMockHost('/api/resource');
      const err = buildQueryFailedError('uq_not_mapped');

      filter.catch(err, host);

      const body = jsonMock.mock.calls[0][0];
      expect(body).toHaveProperty('type');
      expect(body).toHaveProperty('title');
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('detail');
      expect(body).toHaveProperty('instance', '/api/resource');
    });
  });

  describe('known constraint → mapped response (future entries)', () => {
    it('is ready to resolve known constraints once map is populated', () => {
      // Verify the constraintMap is a regular object that can be extended.
      // We access via casting since it's private — this mirrors what M3a tests will do
      // once entries are added to the map.
      const internalMap = (filter as any).constraintMap as Record<string, unknown>;
      expect(typeof internalMap).toBe('object');
      // At this stage (2.5) the map is intentionally empty.
      expect(Object.keys(internalMap)).toHaveLength(0);
    });
  });
});
