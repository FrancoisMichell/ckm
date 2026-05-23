import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Class } from './entities/class.entity';
import { ClassEnrollment } from './entities/class-enrollment.entity';
import { User } from '@/users/entities/user.entity';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

/**
 * Classes feature module.
 *
 * Imports:
 *   - TypeOrmModule for Class, ClassEnrollment, and User (for student lookup).
 *   - DataSource is injected directly for transaction support in ClassesService.
 *
 * Exports ClassesService so M6 (ClassSessions) can validate class ownership.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Class, ClassEnrollment, User])],
  controllers: [ClassesController],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
