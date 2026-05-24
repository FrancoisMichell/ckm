import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassSession } from './class-session.entity';
import { ClassesService } from '@/classes/classes.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';

/**
 * Teacher-scoped CRUD for {@link ClassSession} entities.
 *
 * Multi-tenancy invariant: every write and read is scoped through class
 * ownership — a session belongs to a class, and a class belongs to a teacher.
 * Cross-teacher access returns **404** (not 403).
 *
 * Uniqueness dedup is handled by the DB partial unique index
 * `uq_class_sessions_class_date_active`. Violation bubbles up through
 * `QueryFailedErrorFilter` as a 409 Conflict; no `try/catch` in this service.
 *
 * Start/End lifecycle:
 *   - `start()` sets `startTime = now()`. Calling it again → ConflictException.
 *   - `end()` sets `endTime = now()`. Calling it before `start` → BadRequestException.
 *     Calling it again after it was already set → ConflictException.
 */
@Injectable()
export class ClassSessionsService {
  constructor(
    @InjectRepository(ClassSession)
    private readonly sessionsRepository: Repository<ClassSession>,
    private readonly classesService: ClassesService,
  ) {}

  // ---------------------------------------------------------------------------
  // Core CRUD
  // ---------------------------------------------------------------------------

  /**
   * Create a new session. Verifies class ownership first.
   * Duplicate (class_id, date) while active → QueryFailedErrorFilter → 409.
   */
  async create(
    dto: CreateSessionDto,
    currentTeacherId: string,
  ): Promise<ClassSession> {
    // Ownership check — throws 404 if class not found or cross-teacher.
    await this.classesService.findOne(dto.classId, currentTeacherId);

    const session = this.sessionsRepository.create({
      classId: dto.classId,
      date: dto.date,
      notes: dto.notes ?? null,
    });

    return this.sessionsRepository.save(session);
  }

  /**
   * List all non-deleted sessions for every class owned by the teacher.
   */
  async findAll(currentTeacherId: string): Promise<ClassSession[]> {
    return this.sessionsRepository
      .createQueryBuilder('s')
      .innerJoin('s.class', 'c')
      .where('c.teacher_id = :teacherId', { teacherId: currentTeacherId })
      .andWhere('c.deleted_at IS NULL')
      .orderBy('s.date', 'DESC')
      .addOrderBy('s.created_at', 'DESC')
      .getMany();
  }

  /**
   * Find a single session by id, scoped to the calling teacher.
   * Returns 404 if the session does not exist, is soft-deleted, or belongs
   * to a class owned by another teacher.
   */
  async findOne(id: string, currentTeacherId: string): Promise<ClassSession> {
    const session = await this.sessionsRepository
      .createQueryBuilder('s')
      .innerJoin('s.class', 'c')
      .where('s.id = :id', { id })
      .andWhere('c.teacher_id = :teacherId', { teacherId: currentTeacherId })
      .andWhere('c.deleted_at IS NULL')
      .getOne();

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return session;
  }

  /**
   * Patch a session's date/notes. Teacher-scoped via {@link findOne}.
   */
  async update(
    id: string,
    dto: UpdateSessionDto,
    currentTeacherId: string,
  ): Promise<ClassSession> {
    const session = await this.findOne(id, currentTeacherId);

    if (dto.date !== undefined && session.startTime !== null) {
      throw new BadRequestException(
        'Cannot change the date of a session that has already been started',
      );
    }

    if (dto.date !== undefined) session.date = dto.date;
    if (dto.notes !== undefined) session.notes = dto.notes ?? null;

    return this.sessionsRepository.save(session);
  }

  /**
   * Soft-delete a session. Teacher-scoped.
   */
  async softDelete(id: string, currentTeacherId: string): Promise<void> {
    const session = await this.findOne(id, currentTeacherId);
    await this.sessionsRepository.softRemove(session);
  }

  /**
   * Restore a previously soft-deleted session. Teacher-scoped.
   */
  async restore(id: string, currentTeacherId: string): Promise<void> {
    // Must look up with deleted rows visible.
    const session = await this.sessionsRepository
      .createQueryBuilder('s')
      .innerJoin('s.class', 'c')
      .where('s.id = :id', { id })
      .andWhere('c.teacher_id = :teacherId', { teacherId: currentTeacherId })
      .withDeleted()
      .getOne();

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (!session.deletedAt) {
      throw new NotFoundException('Session is not deleted');
    }

    await this.sessionsRepository.restore(id);
  }

  // ---------------------------------------------------------------------------
  // Query helpers (6.4)
  // ---------------------------------------------------------------------------

  /**
   * Return sessions whose date falls in [from, to] (inclusive), scoped to the
   * calling teacher.
   */
  async findByDateRange(
    from: string,
    to: string,
    currentTeacherId: string,
  ): Promise<ClassSession[]> {
    return this.sessionsRepository
      .createQueryBuilder('s')
      .innerJoin('s.class', 'c')
      .where('c.teacher_id = :teacherId', { teacherId: currentTeacherId })
      .andWhere('c.deleted_at IS NULL')
      .andWhere('s.date >= :from', { from })
      .andWhere('s.date <= :to', { to })
      .orderBy('s.date', 'ASC')
      .addOrderBy('s.created_at', 'ASC')
      .getMany();
  }

  /**
   * Return all non-deleted sessions for a specific class, teacher-scoped.
   */
  async findByClass(
    classId: string,
    currentTeacherId: string,
  ): Promise<ClassSession[]> {
    // Validate class ownership first.
    await this.classesService.findOne(classId, currentTeacherId);

    return this.sessionsRepository
      .createQueryBuilder('s')
      .innerJoin('s.class', 'c')
      .where('s.class_id = :classId', { classId })
      .andWhere('c.teacher_id = :teacherId', { teacherId: currentTeacherId })
      .andWhere('c.deleted_at IS NULL')
      .orderBy('s.date', 'DESC')
      .getMany();
  }

  /**
   * Alias for {@link findAll} — returns all sessions owned by the teacher.
   * Exposed as a dedicated route for discoverability.
   */
  async findByTeacher(currentTeacherId: string): Promise<ClassSession[]> {
    return this.findAll(currentTeacherId);
  }

  // ---------------------------------------------------------------------------
  // Start / End lifecycle (6.5)
  // ---------------------------------------------------------------------------

  /**
   * Mark the session as started by setting `startTime = now()`.
   * Idempotency: calling start again after it is already set throws 409.
   */
  async start(id: string, currentTeacherId: string): Promise<ClassSession> {
    const session = await this.findOne(id, currentTeacherId);

    if (session.startTime !== null) {
      throw new ConflictException('Session has already been started');
    }

    session.startTime = new Date();
    return this.sessionsRepository.save(session);
  }

  /**
   * Mark the session as ended by setting `endTime = now()`.
   *
   * Guards:
   *   - `startTime` must be set first (else 400).
   *   - `endTime` must not already be set (else 409).
   */
  async end(id: string, currentTeacherId: string): Promise<ClassSession> {
    const session = await this.findOne(id, currentTeacherId);

    if (session.startTime === null) {
      throw new BadRequestException(
        'Session must be started before it can be ended',
      );
    }

    if (session.endTime !== null) {
      throw new ConflictException('Session has already been ended');
    }

    session.endTime = new Date();
    return this.sessionsRepository.save(session);
  }
}
