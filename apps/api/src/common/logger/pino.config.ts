import { randomUUID } from 'crypto';
import { IncomingMessage, ServerResponse } from 'http';
import { Params } from 'nestjs-pino';

/**
 * Pino / nestjs-pino configuration.
 *
 * - Structured JSON in production; pino-pretty single-line in development.
 * - Request IDs: honour inbound `x-request-id`; generate UUID v4 otherwise;
 *   echo the final ID back as `x-request-id` on the response.
 * - Redaction: auth headers, cookies, credentials and access/refresh tokens,
 *   and the bcrypt/SHA-256 hashes that identify refresh-token rows are all
 *   redacted to `[Redacted]`. The hash paths are covered too because a leaked
 *   `lookupHash` is equivalent to the plaintext token for DB indexing.
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
        // Explicit req.body.* paths: the `*.password` wildcard matches a single
        // path segment and does NOT reach `req.body.password`. These guard
        // credentials if request-body logging is ever enabled.
        'req.body.password',
        'req.body.refresh_token',
        '*.password',
        '*.refresh_token',
        '*.access_token',
        '*.tokenHash',
        '*.lookupHash',
        '*.token_hash',
        '*.lookup_hash',
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
