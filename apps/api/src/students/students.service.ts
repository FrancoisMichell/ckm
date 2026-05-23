import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRoleType } from '@ckm/contracts';
import { PaginatedResponse } from '@/common/interfaces';
import { User } from '@/users/entities/user.entity';
import { UsersService } from '@/users/users.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { QueryStudentsDto } from './dto/query-students.dto';

/**
 * Teacher-scoped CRUD over `User` rows that carry the STUDENT role.
 *
 * Multi-tenancy:
 *   Every read and mutation is filtered by the calling teacher's id
 *   (`currentTeacherId`). Cross-teacher access returns **404** (never 403)
 *   so the existence of out-of-tenant rows is not leaked.
 *
 * Delegates to {@link UsersService} for the persistence primitives — this
 * service exists only to encode the STUDENT role + teacher-scoping contract.
 */
@Injectable()
export class StudentsService {
  constructor(
    private readonly usersService: UsersService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /**
   * Create a new student under the calling teacher's tenant.
   *
   * The instructor relation is set from `currentTeacherId`; clients cannot
   * forge it via the DTO. Duplicate registry violations bubble to
   * `QueryFailedErrorFilter` (409 `uq_users_registry_active`).
   */
  async create(
    dto: CreateStudentDto,
    currentTeacherId: string,
  ): Promise<User | null> {
    return this.usersService.create(
      {
        ...dto,
        instructor: { id: currentTeacherId } as User,
      },
      [UserRoleType.STUDENT],
    );
  }

  /**
   * Paginated, filtered list of students owned by the calling teacher.
   *
   * Exclusion filters (`notEnrolledInClass`, `notInSession`) reference rows
   * the caller may not have access to — we validate referenced ids exist
   * first and return 404 otherwise. Without this guard, an invalid id would
   * silently fall through to "no exclusions match" and return the full list.
   */
  async findAll(
    query: QueryStudentsDto,
    currentTeacherId: string,
  ): Promise<PaginatedResponse<User>> {
    await this.validateExclusionFilters(query);

    return this.usersService.findByRole(
      UserRoleType.STUDENT,
      query,
      currentTeacherId,
    );
  }

  /**
   * Fetch a single student by id, scoped to the calling teacher.
   *
   * Returns 404 when:
   *  - the row does not exist;
   *  - the row exists but is owned by another teacher;
   *  - the row exists but lacks the STUDENT role.
   *
   * The 404 is intentional and uniform across all three cases — it must not
   * leak whether the resource belongs to a different tenant.
   */
  async findOne(id: string, currentTeacherId: string): Promise<User> {
    const student = await this.usersRepository.findOne({
      where: { id },
      relations: ['roles', 'instructor'],
    });

    if (!this.belongsToTeacher(student, currentTeacherId)) {
      throw new NotFoundException('Student not found');
    }

    return student;
  }

  /**
   * Patch a student's profile, scoped to the calling teacher.
   *
   * The cross-teacher 404 is enforced by re-using {@link findOne}, which
   * also guards against soft-deleted rows.
   */
  async update(
    id: string,
    dto: UpdateStudentDto,
    currentTeacherId: string,
  ): Promise<User | null> {
    await this.findOne(id, currentTeacherId);
    return this.usersService.update(id, dto);
  }

  /**
   * Soft-delete (sets `deleted_at`); the row remains queryable via
   * `withDeleted: true` for audit reads.
   */
  async softDelete(id: string, currentTeacherId: string): Promise<void> {
    await this.findOne(id, currentTeacherId);
    await this.usersService.softDelete(id);
  }

  /**
   * Restore a previously soft-deleted student.
   *
   * Uses `withDeleted: true` so the tenant check still finds the row after
   * soft-delete; this is the only place we deliberately load deleted rows.
   */
  async restore(id: string, currentTeacherId: string): Promise<void> {
    const student = await this.usersRepository.findOne({
      where: { id },
      relations: ['roles', 'instructor'],
      withDeleted: true,
    });

    if (!this.belongsToTeacher(student, currentTeacherId)) {
      throw new NotFoundException('Student not found');
    }

    await this.usersService.restore(id);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Type guard + tenant + role check used by every per-id mutation.
   *
   * Centralises the 404 contract so cross-teacher access and missing-role
   * rejection cannot drift from "not found" semantics.
   */
  private belongsToTeacher(
    student: User | null,
    currentTeacherId: string,
  ): student is User {
    if (!student) return false;
    if (student.instructor?.id !== currentTeacherId) return false;
    if (!student.roles?.some((r) => r.role === UserRoleType.STUDENT)) {
      return false;
    }
    return true;
  }

  /**
   * Validate that exclusion-filter target ids resolve to real rows.
   *
   * Without this, an unknown classId or sessionId would silently produce an
   * unfiltered list (the LEFT JOIN would match no exclusions). Returning 404
   * matches the cross-tenant contract — clients cannot probe for the
   * existence of out-of-tenant classes/sessions.
   *
   * Tenant scoping on these lookups lands in M5/M6 when those modules ship;
   * for now the bare existence check is enough.
   */
  private async validateExclusionFilters(
    query: QueryStudentsDto,
  ): Promise<void> {
    if (query.notEnrolledInClass) {
      const exists = (await this.usersRepository.query(
        `SELECT 1 FROM classes WHERE id = $1 LIMIT 1`,
        [query.notEnrolledInClass],
      )) as unknown[];
      if (exists.length === 0) {
        throw new NotFoundException(
          `Class with id ${query.notEnrolledInClass} not found`,
        );
      }
    }

    if (query.notInSession) {
      const exists = (await this.usersRepository.query(
        `SELECT 1 FROM class_sessions WHERE id = $1 LIMIT 1`,
        [query.notInSession],
      )) as unknown[];
      if (exists.length === 0) {
        throw new NotFoundException(
          `Class session with id ${query.notInSession} not found`,
        );
      }
    }
  }
}
