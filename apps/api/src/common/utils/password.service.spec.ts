import { ConfigService } from '@nestjs/config';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    const configService = {
      getOrThrow: jest.fn().mockReturnValue(1), // bcrypt rounds = 1 for speed in tests
    } as unknown as ConfigService;

    service = new PasswordService(configService);
  });

  describe('hashPassword', () => {
    it('returns a bcrypt hash string', async () => {
      const hash = await service.hashPassword('password123');
      expect(typeof hash).toBe('string');
      expect(hash).toMatch(/^\$2b\$/);
    });

    it('returns a different hash on each call (salt is random)', async () => {
      const hash1 = await service.hashPassword('password123');
      const hash2 = await service.hashPassword('password123');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('compare', () => {
    it('returns true when plaintext matches the hash', async () => {
      const hash = await service.hashPassword('correct_password');
      const result = await service.compare('correct_password', hash);
      expect(result).toBe(true);
    });

    it('returns false when plaintext does not match the hash', async () => {
      const hash = await service.hashPassword('correct_password');
      const result = await service.compare('wrong_password', hash);
      expect(result).toBe(false);
    });

    it('returns false for empty string against non-empty hash', async () => {
      const hash = await service.hashPassword('non_empty');
      const result = await service.compare('', hash);
      expect(result).toBe(false);
    });
  });
});
