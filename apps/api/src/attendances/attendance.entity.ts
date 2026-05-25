import { AttendanceStatus } from '@ckm/contracts';
import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClassSession } from '@/class-sessions/class-session.entity';
import { User } from '@/users/entities/user.entity';

/**
 * Represents a single student's attendance record for a dated class session.
 *
 * Multi-tenancy: ownership is derived through `session → class → teacherId`.
 * All service queries must validate session ownership before touching rows.
 *
 * Key invariants:
 *
 * 1. `isEnrolledClass` is an AUDIT SNAPSHOT set once at insert time and
 *    NEVER recomputed on read. It reflects whether the student was enrolled
 *    in the class at the moment the attendance row was created.
 *
 * 2. `checkedInAt` is set automatically to `now()` on PRESENT and LATE
 *    status transitions, and cleared to `null` on ABSENT and EXCUSED.
 *
 * 3. Partial unique index `uq_attendances_session_student_active` on
 *    (session_id, student_id) WHERE deleted_at IS NULL enforces deduplication
 *    at DB level. Violation is mapped by QueryFailedErrorFilter → 409.
 *
 * 4. `create` in AttendancesService is idempotent: if a row already exists
 *    for (session, student), it is returned unchanged.
 */
@Entity('attendances')
export class Attendance {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  /**
   * FK to the owning class session.
   * Named constraint: `fk_attendances_session` (ON DELETE CASCADE).
   */
  @ManyToOne(() => ClassSession, { nullable: false, eager: false })
  @JoinColumn({ name: 'session_id' })
  declare session: ClassSession;

  @Column({ name: 'session_id' })
  declare sessionId: string;

  /**
   * FK to the student (User with STUDENT role).
   * Named constraint: `fk_attendances_student` (ON DELETE CASCADE).
   */
  @ManyToOne(() => User, { nullable: false, eager: false })
  @JoinColumn({ name: 'student_id' })
  declare student: User;

  @Column({ name: 'student_id' })
  declare studentId: string;

  /**
   * Current attendance status. Defaults to PENDING on creation.
   * Use the service mark* methods to transition statuses.
   */
  @Column({
    type: 'varchar',
    default: AttendanceStatus.PENDING,
  })
  declare status: AttendanceStatus;

  /**
   * Audit snapshot: was the student actively enrolled in the class
   * at the moment this attendance record was CREATED?
   *
   * INVARIANT: set once at insert, never recomputed on read.
   * Not a live enrollment check — it is a historical snapshot for
   * auditing purposes (e.g. distinguishing walk-in guests from
   * enrolled students at the time of the session).
   */
  @Column({ name: 'is_enrolled_class', default: false })
  declare isEnrolledClass: boolean;

  /**
   * Wall-clock timestamp when the student checked in.
   * Set to `now()` on PRESENT or LATE transitions.
   * Cleared to `null` on ABSENT or EXCUSED transitions.
   */
  @Column({ name: 'checked_in_at', type: 'timestamptz', nullable: true })
  declare checkedInAt: Date | null;

  /**
   * Optional free-text notes (max 500 characters).
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  declare notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  declare createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  declare updatedAt: Date;

  @Exclude()
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  declare deletedAt: Date | null;
}
