import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { PasswordService } from '../common/utils/password.service';
import { NoopErrorReporter } from '../common/error-reporter/noop-error-reporter';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';

/**
 * AuthModule wires together:
 * - JwtModule configured async from ConfigService (no fallback on secret).
 * - PassportModule with default jwt strategy.
 * - TypeORM registration for the RefreshToken entity.
 * - UsersModule for credential validation.
 * - AuthService + JwtStrategy + LocalStrategy.
 */
@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        // getOrThrow enforces that JWT_SECRET must be set — no fallback.
        secret: configService.getOrThrow<string>('jwt.secret'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    TypeOrmModule.forFeature([RefreshToken]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    LocalStrategy,
    PasswordService,
    // Module-local fallback for the `ErrorReporter` token. AppModule binds
    // the production-grade reporter (Noop today, Sentry later) via the same
    // token; this entry is necessary because providers declared on the root
    // module are NOT auto-visible inside child modules' DI scopes — without
    // it, AuthService cannot resolve `@Inject('ErrorReporter')`. Swap both
    // bindings together when introducing a real reporter.
    { provide: 'ErrorReporter', useClass: NoopErrorReporter },
  ],
  exports: [JwtModule, AuthService],
})
export class AuthModule {}
