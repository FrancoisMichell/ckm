import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ProblemDetailsExceptionFilter } from './problem-details-exception.filter';
import { NoopErrorReporter } from '../error-reporter/noop-error-reporter';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function buildMockHost(url = '/test') {
  const json = jest.fn();
  const type = jest.fn().mockReturnThis();
  const status = jest.fn().mockReturnValue({ type, json });

  // Chain: status(x).type(y).json(z)
  type.mockReturnValue({ json });

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

describe('ProblemDetailsExceptionFilter', () => {
  let filter: ProblemDetailsExceptionFilter;
  let reporter: NoopErrorReporter;

  beforeEach(() => {
    reporter = new NoopErrorReporter();
    filter = new ProblemDetailsExceptionFilter(reporter);
  });

  describe('HttpException → problem+json shape', () => {
    it('returns 404 problem+json for NotFoundException', () => {
      const { host, statusMock, typeMock, jsonMock } = buildMockHost('/api/users/999');
      filter.catch(new NotFoundException('User not found'), host);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(typeMock).toHaveBeenCalledWith('application/problem+json');

      const body = jsonMock.mock.calls[0][0];
      expect(body.status).toBe(404);
      expect(body.detail).toBe('User not found');
      expect(body.instance).toBe('/api/users/999');
      expect(body.type).toMatch(/not-found/);
    });

    it('returns 400 problem+json for BadRequestException', () => {
      const { host, statusMock, jsonMock } = buildMockHost('/api/students');
      filter.catch(new BadRequestException('Bad input'), host);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      const body = jsonMock.mock.calls[0][0];
      expect(body.status).toBe(400);
      expect(body.detail).toBe('Bad input');
    });

    it('returns 422 with errors array for UnprocessableEntityException with array message', () => {
      const { host, jsonMock } = buildMockHost('/api/students');
      const exception = new UnprocessableEntityException({
        statusCode: 422,
        message: ['name: name must be a string', 'age: age must be a number'],
        error: 'Unprocessable Entity',
      });
      filter.catch(exception, host);

      const body = jsonMock.mock.calls[0][0];
      expect(body.status).toBe(422);
      expect(body.detail).toBe('One or more fields failed validation.');
      expect(Array.isArray(body.errors)).toBe(true);
      expect(body.errors).toHaveLength(2);
      expect(body.errors[0]).toEqual({ field: 'name', message: 'name must be a string' });
      expect(body.errors[1]).toEqual({ field: 'age', message: 'age must be a number' });
    });

    it('includes type, title, status, detail, instance in all responses', () => {
      const { host, jsonMock } = buildMockHost('/api/test');
      filter.catch(new NotFoundException('Missing resource'), host);

      const body = jsonMock.mock.calls[0][0];
      expect(body).toHaveProperty('type');
      expect(body).toHaveProperty('title');
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('detail');
      expect(body).toHaveProperty('instance');
    });

    it('does not include errors field for non-422 responses', () => {
      const { host, jsonMock } = buildMockHost('/api/test');
      filter.catch(new BadRequestException('Bad'), host);

      const body = jsonMock.mock.calls[0][0];
      expect(body).not.toHaveProperty('errors');
    });

    it('sets content type to application/problem+json', () => {
      const { host, typeMock } = buildMockHost();
      filter.catch(new NotFoundException('x'), host);
      expect(typeMock).toHaveBeenCalledWith('application/problem+json');
    });
  });

  describe('Non-HttpException → 500', () => {
    it('returns 500 for a plain Error', () => {
      const { host, statusMock, jsonMock } = buildMockHost('/api/crash');
      const captureExceptionSpy = jest.spyOn(reporter, 'captureException');

      filter.catch(new Error('kaboom'), host);

      expect(statusMock).toHaveBeenCalledWith(500);
      const body = jsonMock.mock.calls[0][0];
      expect(body.status).toBe(500);
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ path: '/api/crash' }),
      );
    });

    it('returns 500 for unknown thrown object', () => {
      const { host, statusMock } = buildMockHost();
      filter.catch({ weird: true }, host);
      expect(statusMock).toHaveBeenCalledWith(500);
    });
  });

  describe('HttpException with string body', () => {
    it('handles plain string exception response', () => {
      const { host, jsonMock } = buildMockHost('/api/test');
      const ex = new HttpException('plain string body', 400);
      filter.catch(ex, host);

      const body = jsonMock.mock.calls[0][0];
      expect(body.status).toBe(400);
      expect(body.detail).toBe('plain string body');
    });
  });
});
