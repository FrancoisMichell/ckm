import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { UserPayload } from '../interfaces/user-payload.interface';

/**
 * Validates the JWT Bearer token from the Authorization header.
 *
 * Secret is read via configService.getOrThrow — no fallback is allowed.
 * If JWT_SECRET is not set in the environment, Joi validation aborts
 * the process at startup before this class is even instantiated.
 *
 * validate() returns the UserPayload shape that becomes request.user.
 * It does NOT hit the database — all required data is embedded in the
 * JWT payload, which is cryptographically verified by passport-jwt.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
    });
  }

  validate(payload: JwtPayload): UserPayload {
    return {
      id: payload.sub,
      registry: payload.username,
      name: payload.name,
      roles: payload.roles ?? [],
    };
  }
}
