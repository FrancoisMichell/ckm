import { ExecutionContext, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { Request } from 'express';
import configuration, {
  envValidationSchema,
} from './config/configuration';
import { pinoConfig } from './common/logger/pino.config';
import { ErrorReporterModule } from './common/error-reporter/error-reporter.module';
import { PasswordService } from './common/utils/password.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Module({
  imports: [
    // ------------------------------------------------------------------
    // Configuration — validates env vars at startup via Joi schema.
    // Missing required vars (DB_*, JWT_SECRET) abort the process.
    // ------------------------------------------------------------------
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),

    // ------------------------------------------------------------------
    // Pino logger — global, structured JSON in production.
    // ------------------------------------------------------------------
    LoggerModule.forRoot(pinoConfig),

    // ------------------------------------------------------------------
    // ErrorReporter — single @Global() binding for the 'ErrorReporter'
    // token. Swap NoopErrorReporter for SentryErrorReporter (etc.) in
    // ErrorReporterModule when introducing a real reporter; no other
    // module needs to change.
    // ------------------------------------------------------------------
    ErrorReporterModule,

    // ------------------------------------------------------------------
    // Throttler — global default 100 requests / 60s per IP.
    // POST /auth/login overrides this with @Throttle 5/60s.
    //
    // The skipIf escape hatch honours `x-test-skip-throttle: 1` ONLY when
    // NODE_ENV === 'test', so the e2e suite can disable the limit on
    // setup/teardown requests while still exercising 429 in the dedicated
    // throttler spec. The header is inert in development and production
    // because the env check fails closed.
    // ------------------------------------------------------------------
    ThrottlerModule.forRoot({
      throttlers: [{ limit: 100, ttl: 60_000 }],
      skipIf: (context: ExecutionContext): boolean => {
        if (process.env['NODE_ENV'] !== 'test') return false;
        const req = context.switchToHttp().getRequest<Request>();
        return req.headers['x-test-skip-throttle'] === '1';
      },
    }),

    // ------------------------------------------------------------------
    // Feature modules
    // ------------------------------------------------------------------
    UsersModule,
    AuthModule,

    // ------------------------------------------------------------------
    // TypeORM — connection from config; no synchronize, no auto-migrate.
    // ------------------------------------------------------------------
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.getOrThrow<string>('database.host'),
        port: config.getOrThrow<number>('database.port'),
        username: config.getOrThrow<string>('database.user'),
        password: config.getOrThrow<string>('database.password'),
        database: config.getOrThrow<string>('database.name'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../db/migrations/*{.ts,.js}'],
        migrationsTableName: 'migrations',
        migrationsRun: false,
        synchronize: false,
        logging: config.get<boolean>('database.logging') ?? false,
      }),
    }),
  ],
  controllers: [],
  providers: [
    PasswordService,
    // Global guard chain — order matters: Jwt → Roles → Throttler.
    // (NestJS executes APP_GUARDs in registration order.)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [PasswordService],
})
export class AppModule {}
