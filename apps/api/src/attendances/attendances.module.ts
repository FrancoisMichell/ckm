import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attendance } from './attendance.entity';
import { AttendancesController } from './attendances.controller';
import { AttendancesService } from './attendances.service';
import { ClassSession } from '@/class-sessions/class-session.entity';
import { ClassEnrollment } from '@/classes/entities/class-enrollment.entity';

/**
 * AttendancesModule wires the Attendance entity, service, and controller.
 *
 * It also imports ClassSession and ClassEnrollment repositories directly
 * (via TypeOrmModule.forFeature) to avoid circular service-to-service
 * dependencies while still being able to validate session ownership and
 * compute the `isEnrolledClass` snapshot.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Attendance, ClassSession, ClassEnrollment]),
  ],
  controllers: [AttendancesController],
  providers: [AttendancesService],
  exports: [AttendancesService],
})
export class AttendancesModule {}
