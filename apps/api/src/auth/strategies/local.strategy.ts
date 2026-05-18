import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';
import { UserPayload } from '../interfaces/user-payload.interface';

/**
 * Passport-local strategy for registry + password authentication.
 *
 * usernameField is set to 'registry' because the app uses the academy
 * registry number as the login identifier, not an email address.
 *
 * Delegates credential validation to AuthService.validateCredentials,
 * which applies bcrypt comparison and checks for TEACHER role and soft-delete.
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'registry' });
  }

  async validate(registry: string, password: string): Promise<UserPayload> {
    const user = await this.authService.validateCredentials(registry, password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    return user;
  }
}
