import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '@/app.module';
import { setupApp } from '@/common/setup-app';
import { NoopErrorReporter } from '@/common/error-reporter/noop-error-reporter';

export async function createTestApp(): Promise<{
  app: INestApplication;
  ds: DataSource;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  setupApp(app, new NoopErrorReporter(), 'http://localhost:5173');
  await app.init();

  const ds = moduleRef.get<DataSource>(getDataSourceToken());
  return { app, ds };
}
