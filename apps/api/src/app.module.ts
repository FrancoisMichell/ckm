import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import configuration, {
  envValidationSchema,
} from './config/configuration';
import { pinoConfig } from './common/logger/pino.config';
import { NoopErrorReporter } from './common/error-reporter/noop-error-reporter';
import { PasswordService } from './common/utils/password.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';

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
    // ErrorReporter token — swap useClass for SentryErrorReporter when ready.
    { provide: 'ErrorReporter', useClass: NoopErrorReporter },
    PasswordService,
  ],
  exports: [PasswordService],
})
export class AppModule {}
