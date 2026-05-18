import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { RefreshToken } from './entities/refresh-token.entity';

/**
 * AuthModule wires together:
 * - JwtModule configured async from ConfigService (no fallback on secret).
 * - PassportModule with default jwt strategy.
 * - TypeORM registration for the RefreshToken entity.
 * - UsersModule for credential validation.
 *
 * Strategies, guards, and AuthService are added in subsequent sub-steps.
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
  controllers: [],
  providers: [],
  exports: [JwtModule],
})
export class AuthModule {}
