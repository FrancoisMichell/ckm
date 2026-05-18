import { Module } from '@nestjs/common';
import { UsersModule } from '@/users/users.module';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

/**
 * Students feature module.
 *
 * Imports `UsersModule` for the shared `UsersService` and `TypeOrmModule` re-export
 * (the User repository is needed for the tenant guard query). No own entities.
 */
@Module({
  imports: [UsersModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
