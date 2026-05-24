import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassSession } from './class-session.entity';
import { ClassSessionsController } from './class-sessions.controller';
import { ClassSessionsService } from './class-sessions.service';
import { ClassesModule } from '@/classes/classes.module';

/**
 * ClassSessions feature module.
 *
 * Imports:
 *   - TypeOrmModule for ClassSession repository.
 *   - ClassesModule (exported ClassesService) for class-ownership checks.
 *
 * Exports ClassSessionsService if future modules (e.g. Attendances) need it.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ClassSession]), ClassesModule],
  controllers: [ClassSessionsController],
  providers: [ClassSessionsService],
  exports: [ClassSessionsService],
})
export class ClassSessionsModule {}
