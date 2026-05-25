import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AttendanceStatus } from '@ckm/contracts';
import { Attendance } from './attendance.entity';
import { ClassSession } from '@/class-sessions/class-session.entity';
import { ClassEnrollment } from '@/classes/entities/class-enrollment.entity';
import { User } from '@/users/entities/user.entity';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { QueryAttendancesDto } from './dto/query-attendances.dto';
import { UpdateAttendanceNotesDto } from './dto/update-attendance-notes.dto';

/**
 * Teacher-scoped service for {@link Attendance} entities.
 *
 * Multi-tenancy invariant: every write and read is scoped through session
 * ownership (session → class → teacherId). Cross-teacher access returns
 * **404** (not 403).
 *
 * Key invariants enforced here:
 *
 * 1. `isEnrolledClass` is computed from current enrollment AT INSERT TIME
 *    and never recomputed afterwards. It is an audit snapshot.
 *
 * 2. `create()` is idempotent: calling it twice for the same (session,
 *    student) pair returns the existing row unchanged.
 *
 * 3. `createBulk()` wraps all single-creates in a transaction. Re-running
 *    on the same session returns existing rows unchanged — `isEnrolledClass`
 *    reflects the value at the time of the FIRST insert.
 *
 * 4. `markPresent()` and `markLate()` set `checkedInAt = now()`.
 *    `markAbsent()` and `markExcused()` clear `checkedInAt` to `null`.
 *
 * 5. No `try/catch` on Postgres error codes. Named constraint violations
 *    bubble up to `QueryFailedErrorFilter`.
 */
@Injectable()
export class AttendancesService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendancesRepository: Repository<Attendance>,
    @InjectRepository(ClassSession)
    private readonly sessionsRepository: Repository<ClassSession>,
    @InjectRepository(ClassEnrollment)
    private readonly enrollmentsRepository: Repository<ClassEnrollment>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Validate that the given session exists and belongs to the calling teacher.
   * Returns the session or throws 404.
   */
  private async resolveSession(
    sessionId: string,
    teacherId: string,
  ): Promise<ClassSession> {
    const session = await this.sessionsRepository
      .createQueryBuilder('s')
      .innerJoin('s.class', 'c')
      .where('s.id = :sessionId', { sessionId })
      .andWhere('c.teacher_id = :teacherId', { teacherId })
      .andWhere('s.deleted_at IS NULL')
      .andWhere('c.deleted_at IS NULL')
      .getOne();

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return session;
  }

  /**
   * Validate that the given student exists and belongs to the calling
   * teacher (`instructor_id = teacherId`). Throws 404 otherwise.
   *
   * Without this, a teacher could attach another teacher's student to their
   * own session — a cross-tenant write that leaks foreign student PII.
   */
  private async resolveStudent(
    studentId: string,
    teacherId: string,
  ): Promise<void> {
    const student = await this.usersRepository.findOne({
      where: { id: studentId, instructor: { id: teacherId } },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }
  }

  /**
   * Find an existing non-deleted attendance row for (session, student).
   * Returns null if no row exists.
   */
  private async findExistingAttendance(
    sessionId: string,
    studentId: string,
  ): Promise<Attendance | null> {
    return this.attendancesRepository.findOne({
      where: { sessionId, studentId },
    });
  }

  /**
   * Re-select the active attendance row for (session, student) after an
   * `ON CONFLICT DO NOTHING` insert. The row is guaranteed to exist by this
   * point (inserted by us or by a racing caller). Accepts an explicit repo
   * so the transactional `createBulk` path can reuse it.
   */
  private async getExistingOrThrow(
    sessionId: string,
    studentId: string,
    repo: Repository<Attendance> = this.attendancesRepository,
  ): Promise<Attendance> {
    const row = await repo.findOne({ where: { sessionId, studentId } });
    if (!row) {
      throw new NotFoundException('Attendance not found');
    }
    return row;
  }

  /**
   * Check whether the student has an active enrollment in the given class.
   * Used to compute the `isEnrolledClass` snapshot at insert time.
   */
  private async isStudentEnrolledInClass(
    classId: string,
    studentId: string,
  ): Promise<boolean> {
    const enrollment = await this.enrollmentsRepository.findOne({
      where: { classId, userId: studentId },
    });
    return enrollment !== null;
  }

  // ---------------------------------------------------------------------------
  // Sub-step 7.3 — Single idempotent create
  // ---------------------------------------------------------------------------

  /**
   * Create a single attendance row for a (session, student) pair.
   *
   * IDEMPOTENCY: if a row already exists (non-deleted), return it unchanged.
   * This invariant holds even across concurrent callers: the INSERT uses
   * `ON CONFLICT DO NOTHING` against the partial unique index
   * `uq_attendances_session_student_active`, and we re-select afterwards.
   * A racing second caller therefore returns the existing row instead of a
   * 409 — important for the offline-replay / double-tap flow.
   *
   * `isEnrolledClass` is computed from current enrollment state and set
   * ONCE at insert time. On subsequent idempotent returns the existing
   * stored value is returned as-is.
   */
  async create(
    dto: CreateAttendanceDto,
    teacherId: string,
  ): Promise<Attendance> {
    // Ownership check — throws 404 if session not found or cross-teacher.
    const session = await this.resolveSession(dto.sessionId, teacherId);

    // Student-ownership check — prevents attaching a foreign teacher's
    // student to this session (cross-tenant PII linkage).
    await this.resolveStudent(dto.studentId, teacherId);

    // Idempotency fast-path: return existing row if it already exists.
    const existing = await this.findExistingAttendance(
      dto.sessionId,
      dto.studentId,
    );
    if (existing) {
      return existing;
    }

    // Compute the enrollment snapshot at insert time.
    const isEnrolledClass = await this.isStudentEnrolledInClass(
      session.classId,
      dto.studentId,
    );

    // ON CONFLICT DO NOTHING — a concurrent insert of the same (session,
    // student) is absorbed rather than raising 23505 → 409.
    await this.attendancesRepository
      .createQueryBuilder()
      .insert()
      .into(Attendance)
      .values({
        sessionId: dto.sessionId,
        studentId: dto.studentId,
        notes: dto.notes ?? null,
        isEnrolledClass,
        status: AttendanceStatus.PENDING,
      })
      .orIgnore()
      .execute();

    // Re-select: the row now exists (inserted by us or by the racing caller).
    return this.getExistingOrThrow(dto.sessionId, dto.studentId);
  }

  // ---------------------------------------------------------------------------
  // Sub-step 7.4 — Bulk idempotent create
  // ---------------------------------------------------------------------------

  /**
   * Bulk-create attendance rows for ALL currently-enrolled students in the
   * session's class.
   *
   * IDEMPOTENCY: if a row already exists for a student, return it unchanged.
   * The `isEnrolledClass` value on existing rows is NEVER updated — it
   * reflects the enrollment state at the time of the FIRST insert.
   *
   * This operation is wrapped in a transaction so that either all new rows
   * are inserted or none are (partial failures roll back).
   *
   * Algorithm:
   *   1. Validate session ownership.
   *   2. Fetch all active enrollments for the session's class.
   *   3. For each enrolled student, call the idempotent single-create logic.
   *
   * Returns the full list of attendance rows (existing + newly created).
   */
  async createBulk(
    sessionId: string,
    teacherId: string,
  ): Promise<Attendance[]> {
    // Ownership check.
    const session = await this.resolveSession(sessionId, teacherId);

    // Fetch active enrollments.
    const enrollments = await this.enrollmentsRepository.find({
      where: { classId: session.classId },
    });

    const results: Attendance[] = [];

    await this.dataSource.transaction(async (manager) => {
      const attendanceRepo = manager.getRepository(Attendance);

      for (const enrollment of enrollments) {
        // Idempotency fast-path: check for existing non-deleted row.
        const existing = await attendanceRepo.findOne({
          where: { sessionId, studentId: enrollment.userId },
        });

        if (existing) {
          results.push(existing);
          continue;
        }

        // New row — snapshot current enrollment state.
        // Since we got the enrollment from the DB above, it is active.
        // ON CONFLICT DO NOTHING absorbs a concurrent insert of the same
        // (session, student) instead of raising 23505 → 409.
        await attendanceRepo
          .createQueryBuilder()
          .insert()
          .into(Attendance)
          .values({
            sessionId,
            studentId: enrollment.userId,
            isEnrolledClass: true,
            status: AttendanceStatus.PENDING,
            notes: null,
          })
          .orIgnore()
          .execute();

        results.push(
          await this.getExistingOrThrow(
            sessionId,
            enrollment.userId,
            attendanceRepo,
          ),
        );
      }
    });

    return results;
  }

  // ---------------------------------------------------------------------------
  // Sub-step 7.5 — Status shortcut methods
  // ---------------------------------------------------------------------------

  /**
   * Find a single attendance row by id, scoped to the calling teacher.
   * Returns 404 if not found or cross-teacher.
   */
  async findOne(id: string, teacherId: string): Promise<Attendance> {
    const attendance = await this.attendancesRepository
      .createQueryBuilder('a')
      .innerJoin('a.session', 's')
      .innerJoin('s.class', 'c')
      .where('a.id = :id', { id })
      .andWhere('c.teacher_id = :teacherId', { teacherId })
      .andWhere('s.deleted_at IS NULL')
      .andWhere('c.deleted_at IS NULL')
      .getOne();

    if (!attendance) {
      throw new NotFoundException('Attendance not found');
    }

    return attendance;
  }

  /**
   * Mark attendance as PRESENT. Sets `checkedInAt = now()`.
   */
  async markPresent(id: string, teacherId: string): Promise<Attendance> {
    const attendance = await this.findOne(id, teacherId);
    attendance.status = AttendanceStatus.PRESENT;
    attendance.checkedInAt = new Date();
    return this.attendancesRepository.save(attendance);
  }

  /**
   * Mark attendance as LATE. Sets `checkedInAt = now()`.
   */
  async markLate(id: string, teacherId: string): Promise<Attendance> {
    const attendance = await this.findOne(id, teacherId);
    attendance.status = AttendanceStatus.LATE;
    attendance.checkedInAt = new Date();
    return this.attendancesRepository.save(attendance);
  }

  /**
   * Mark attendance as ABSENT. Clears `checkedInAt` to `null`.
   */
  async markAbsent(id: string, teacherId: string): Promise<Attendance> {
    const attendance = await this.findOne(id, teacherId);
    attendance.status = AttendanceStatus.ABSENT;
    attendance.checkedInAt = null;
    return this.attendancesRepository.save(attendance);
  }

  /**
   * Mark attendance as EXCUSED. Clears `checkedInAt` to `null`.
   */
  async markExcused(id: string, teacherId: string): Promise<Attendance> {
    const attendance = await this.findOne(id, teacherId);
    attendance.status = AttendanceStatus.EXCUSED;
    attendance.checkedInAt = null;
    return this.attendancesRepository.save(attendance);
  }

  // ---------------------------------------------------------------------------
  // Sub-step 7.6 — Queries and notes update
  // ---------------------------------------------------------------------------

  /**
   * List attendance rows for the calling teacher, with optional filters.
   * All rows are scoped through session → class → teacherId.
   */
  async findAll(
    query: QueryAttendancesDto,
    teacherId: string,
  ): Promise<Attendance[]> {
    const qb = this.attendancesRepository
      .createQueryBuilder('a')
      .innerJoin('a.session', 's')
      .innerJoin('s.class', 'c')
      .where('c.teacher_id = :teacherId', { teacherId })
      .andWhere('s.deleted_at IS NULL')
      .andWhere('c.deleted_at IS NULL')
      .orderBy('a.created_at', 'DESC');

    if (query.sessionId) {
      qb.andWhere('a.session_id = :sessionId', { sessionId: query.sessionId });
    }

    if (query.studentId) {
      qb.andWhere('a.student_id = :studentId', { studentId: query.studentId });
    }

    if (query.status) {
      qb.andWhere('a.status = :status', { status: query.status });
    }

    return qb.getMany();
  }

  /**
   * Update notes on an attendance row. Teacher-scoped.
   * Clears notes when `null` is passed.
   */
  async updateNotes(
    id: string,
    dto: UpdateAttendanceNotesDto,
    teacherId: string,
  ): Promise<Attendance> {
    const attendance = await this.findOne(id, teacherId);
    attendance.notes = dto.notes ?? null;
    return this.attendancesRepository.save(attendance);
  }
}
