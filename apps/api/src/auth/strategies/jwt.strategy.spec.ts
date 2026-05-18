import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  /**
   * Build a ConfigService stub that either returns the secret or throws,
   * matching the real ConfigService.getOrThrow behaviour.
   */
  function makeConfig(secret: string | undefined): ConfigService {
    return {
      getOrThrow: (key: string) => {
        if (key === 'jwt.secret') {
          if (!secret) {
            throw new Error(`Config key "${key}" is not defined`);
          }
          return secret;
        }
        throw new Error(`Config key "${key}" is not defined`);
      },
    } as unknown as ConfigService;
  }

  describe('constructor', () => {
    it('should instantiate when JWT_SECRET is provided', () => {
      const config = makeConfig('a-secret-that-is-at-least-32-characters');
      expect(() => new JwtStrategy(config)).not.toThrow();
    });

    it('should throw when JWT_SECRET is missing', () => {
      const config = makeConfig(undefined);
      expect(() => new JwtStrategy(config)).toThrow();
    });
  });

  describe('validate', () => {
    let strategy: JwtStrategy;

    beforeEach(() => {
      const config = makeConfig('a-secret-that-is-at-least-32-characters');
      strategy = new JwtStrategy(config);
    });

    it('returns a UserPayload derived from the JWT claims', () => {
      const payload = {
        sub: 'user-uuid-123',
        username: 'PROF001',
        name: 'Professor Test',
        roles: ['teacher'],
      };

      const result = strategy.validate(payload);

      expect(result).toEqual({
        id: 'user-uuid-123',
        registry: 'PROF001',
        name: 'Professor Test',
        roles: ['teacher'],
      });
    });

    it('defaults roles to empty array when payload.roles is missing', () => {
      const payload = {
        sub: 'user-uuid-456',
        username: 'PROF002',
        name: 'Another Prof',
        roles: undefined as unknown as string[],
      };

      const result = strategy.validate(payload);

      expect(result.roles).toEqual([]);
    });
  });
});
