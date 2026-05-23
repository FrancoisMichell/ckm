import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Class } from './entities/class.entity';
import { ClassEnrollment } from './entities/class-enrollment.entity';
import { User } from '@/users/entities/user.entity';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

/**
 * Teacher-scoped CRUD for {@link Class} entities and their
 * {@link ClassEnrollment} rows.
 *
 * Multi-tenancy invariant: every find + mutation is filtered by
 * `currentTeacherId`. Cross-teacher access returns **404** (not 403).
 *
 * Enrollment deduplication logic:
 *   1. No row exists                  → create new enrollment.
 *   2. Row exists + deleted_at IS NULL → throw 409 Conflict.
 *   3. Row exists + deleted_at IS NOT NULL → restore (clear deleted_at).
 *
 * This is safe without a transaction at the DB level because the partial
 * unique index `uq_class_enrollments_active` prevents two concurrent
 * inserts from both succeeding. The find-before-insert here is just for
 * the restore UX; the DB remains the source of truth.
 */
@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(Class)
    private readonly classesRepository: Repository<Class>,
    @InjectRepository(ClassEnrollment)
    private readonly enrollmentsRepository: Repository<ClassEnrollment>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------------
  // Class CRUD
  // ---------------------------------------------------------------------------

  /**
   * Create a new class owned by the calling teacher.
   */
  async create(dto: CreateClassDto, currentTeacherId: string): Promise<Class> {
    const cls = this.classesRepository.create({
      ...dto,
      teacherId: currentTeacherId,
      createdById: currentTeacherId,
      updatedById: currentTeacherId,
    });
    return this.classesRepository.save(cls);
  }

  /**
   * Paginated list of all non-deleted classes owned by the calling teacher.
   */
  async findAll(currentTeacherId: string): Promise<Class[]> {
    return this.classesRepository.find({
      where: { teacherId: currentTeacherId },
      order: { name: 'ASC' },
    });
  }

  /**
   * Find a single class by id, scoped to the calling teacher.
   * Returns 404 if the class does not exist or belongs to another teacher.
   */
  async findOne(id: string, currentTeacherId: string): Promise<Class> {
    const cls = await this.classesRepository.findOne({
      where: { id },
    });

    if (!cls || cls.teacherId !== currentTeacherId) {
      throw new NotFoundException('Class not found');
    }

    return cls;
  }

  /**
   * Patch a class's fields. Teacher-scoped via {@link findOne}.
   */
  async update(
    id: string,
    dto: UpdateClassDto,
    currentTeacherId: string,
  ): Promise<Class> {
    const cls = await this.findOne(id, currentTeacherId);

    Object.assign(cls, dto);
    cls.updatedById = currentTeacherId;

    return this.classesRepository.save(cls);
  }

  /**
   * Soft-delete a class (sets `deleted_at`). Teacher-scoped.
   */
  async softDelete(id: string, currentTeacherId: string): Promise<void> {
    const cls = await this.findOne(id, currentTeacherId);
    await this.classesRepository.softRemove(cls);
  }

  /**
   * Restore a previously soft-deleted class. Teacher-scoped.
   */
  async restore(id: string, currentTeacherId: string): Promise<void> {
    const cls = await this.classesRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!cls || cls.teacherId !== currentTeacherId) {
      throw new NotFoundException('Class not found');
    }

    await this.classesRepository.restore(id);
  }

  // ---------------------------------------------------------------------------
  // Enrollment management
  // ---------------------------------------------------------------------------

  /**
   * Enroll a student in a class.
   *
   * Idempotent-restore semantics:
   *   - If an active enrollment already exists → throw 409.
   *   - If a soft-deleted enrollment exists   → restore it (return restored row).
   *   - Otherwise                             → create new row.
   *
   * Both the class and the student are validated as belonging to the calling
   * teacher before any write happens.
   *
   * The operation runs inside a transaction so a concurrent restore+insert
   * race cannot produce two active rows (the partial unique index is the
   * final guard).
   */
  async enroll(
    classId: string,
    studentId: string,
    currentTeacherId: string,
  ): Promise<ClassEnrollment> {
    // Validate class ownership
    await this.findOne(classId, currentTeacherId);

    // Validate student ownership
    const student = await this.usersRepository.findOne({
      where: { id: studentId, instructor: { id: currentTeacherId } },
      relations: ['instructor'],
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    return this.dataSource.transaction(async (manager) => {
      const enrollRepo = manager.getRepository(ClassEnrollment);

      // Look for any enrollment (including soft-deleted).
      const existing = await enrollRepo.findOne({
        where: { classId, userId: studentId },
        withDeleted: true,
      });

      if (existing) {
        if (!existing.deletedAt) {
          // Active enrollment — conflict.
          throw new ConflictException(
            'Student is already enrolled in this class',
          );
        }
        // Soft-deleted enrollment — restore.
        await enrollRepo.restore(existing.id);
        return enrollRepo.findOneOrFail({ where: { id: existing.id } });
      }

      // No existing row — create fresh.
      const enrollment = enrollRepo.create({ classId, userId: studentId });
      return enrollRepo.save(enrollment);
    });
  }

  /**
   * Soft-delete (unenroll) a student from a class.
   * Returns 404 if no active enrollment is found.
   */
  async unenroll(
    classId: string,
    studentId: string,
    currentTeacherId: string,
  ): Promise<void> {
    // Validate class ownership
    await this.findOne(classId, currentTeacherId);

    const enrollment = await this.enrollmentsRepository.findOne({
      where: { classId, userId: studentId, deletedAt: IsNull() },
    });

    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }

    await this.enrollmentsRepository.softRemove(enrollment);
  }

  /**
   * List all actively enrolled students for a given class.
   * Teacher-scoped via class ownership check.
   */
  async findEnrollments(
    classId: string,
    currentTeacherId: string,
  ): Promise<ClassEnrollment[]> {
    // Validate class ownership (throws 404 if not found or cross-teacher)
    await this.findOne(classId, currentTeacherId);

    return this.enrollmentsRepository.find({
      where: { classId, deletedAt: IsNull() },
      relations: ['student', 'student.roles'],
      order: { createdAt: 'ASC' },
    });
  }
}
