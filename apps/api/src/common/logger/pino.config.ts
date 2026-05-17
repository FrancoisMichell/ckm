import { randomUUID } from 'crypto';
import { IncomingMessage, ServerResponse } from 'http';
import { Params } from 'nestjs-pino';

/**
 * Pino / nestjs-pino configuration.
 *
 * - Structured JSON in production; pino-pretty single-line in development.
 * - Request IDs: honour inbound `x-request-id`; generate UUID v4 otherwise;
 *   echo the final ID back as `x-request-id` on the response.
 * - Redaction: `req.headers.authorization`, `req.headers.cookie`,
 *   `*.password`, `*.refresh_token` are redacted to `[Redacted]`.
 */
export const pinoConfig: Params = {
  pinoHttp: {
    transport:
      process.env['NODE_ENV'] !== 'production'
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,

    level: process.env['LOG_LEVEL'] ?? 'info',

    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.refresh_token',
      ],
      censor: '[Redacted]',
    },

    customProps: (req: IncomingMessage) => ({
      requestId: (req as IncomingMessage & { id?: string }).id,
    }),

    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const incoming = req.headers['x-request-id'];
      const id =
        typeof incoming === 'string' && incoming.length < 100
          ? incoming
          : randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
  },
};
