import { UnauthorizedException } from '@nestjs/common';
import { LocalStrategy } from './local.strategy';
import { AuthService } from '../auth.service';
import { UserPayload } from '../interfaces/user-payload.interface';

describe('LocalStrategy', () => {
  function makeAuthService(
    result: UserPayload | null,
  ): jest.Mocked<Pick<AuthService, 'validateCredentials'>> {
    return {
      validateCredentials: jest.fn().mockImplementation(async () => {
        if (!result) throw new UnauthorizedException('Invalid credentials.');
        return result;
      }),
    };
  }

  it('returns the UserPayload on successful credential validation', async () => {
    const payload: UserPayload = {
      id: 'user-id-1',
      registry: 'PROF001',
      name: 'Professor One',
      roles: ['teacher'],
    };
    const authService = makeAuthService(payload);
    const strategy = new LocalStrategy(authService as unknown as AuthService);

    const result = await strategy.validate('PROF001', 'password123');

    expect(result).toEqual(payload);
    expect(authService.validateCredentials).toHaveBeenCalledWith(
      'PROF001',
      'password123',
    );
  });

  it('throws UnauthorizedException when validateCredentials throws', async () => {
    const authService = makeAuthService(null);
    const strategy = new LocalStrategy(authService as unknown as AuthService);

    await expect(
      strategy.validate('PROF001', 'wrong-password'),
    ).rejects.toThrow(UnauthorizedException);
  });
});
