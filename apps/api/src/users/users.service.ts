import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Belt, UserRoleType } from '@ckm/contracts';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { PasswordService } from '@/common/utils/password.service';
import { PaginatedResponse } from '@/common/interfaces';
import { User } from './entities/user.entity';
import { UserRole } from './entities/user-role.entity';
import { QueryUsersDto } from './dto/query-users.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(UserRole)
    private readonly userRolesRepository: Repository<UserRole>,
    private readonly passwordService: PasswordService,
  ) {}

  /**
   * Creates a new user with the given roles.
   * Password is bcrypt-hashed before storage.
   * Constraint violations (e.g. duplicate registry) bubble to QueryFailedErrorFilter.
   */
  async create(
    userData: Partial<User>,
    roles: UserRoleType[],
  ): Promise<User | null> {
    if (userData.password) {
      userData.password = await this.passwordService.hashPassword(
        userData.password,
      );
    }

    const user = this.usersRepository.create({
      ...userData,
      roles: roles.map((role) => this.userRolesRepository.create({ role })),
    });

    const saved = await this.usersRepository.save(user);
    return this.findById(saved.id);
  }

  /**
   * Find a user by primary key, loading roles and instructor relation.
   */
  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
      relations: ['roles', 'instructor'],
    });
  }

  /**
   * Find a user by registry field, loading roles relation.
   */
  async findByRegistry(registry: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { registry },
      relations: ['roles'],
    });
  }

  /**
   * Update a user's fields by id.
   * Returns the updated user or null if not found.
   */
  async update(id: string, patch: Partial<User>): Promise<User | null> {
    if (patch.password) {
      patch.password = await this.passwordService.hashPassword(patch.password);
    }
    await this.usersRepository.update(id, patch);
    return this.findById(id);
  }

  /**
   * Returns paginated users filtered by role, with optional name/registry/belt
   * text filters, exclusion filters (notEnrolledInClass, notInSession), and
   * belt-rank CASE-expression sort.
   *
   * When teacherId is provided, results are scoped to students of that instructor.
   */
  async findByRole(
    role: UserRoleType,
    query: QueryUsersDto,
    teacherId?: string,
  ): Promise<PaginatedResponse<User>> {
    const {
      page = 1,
      limit = 10,
      name,
      registry,
      belts,
      notEnrolledInClass,
      notInSession,
      sortBy = 'name',
      sortOrder = 'ASC',
    } = query;

    const skip = (page - 1) * limit;

    const qb = this.usersRepository
      .createQueryBuilder('user')
      .leftJoin('user.roles', 'role')
      .where('role.role = :role', { role });

    // Instructor (teacher) scoping
    if (teacherId) {
      qb.andWhere('user.instructor_id = :teacherId', { teacherId });
    }

    // Text filters
    if (name) {
      qb.andWhere('LOWER(user.name) LIKE LOWER(:name)', {
        name: `%${name}%`,
      });
    }

    if (registry) {
      qb.andWhere('lower(user.registry) LIKE lower(:registry)', {
        registry: `%${registry}%`,
      });
    }

    if (belts && belts.length > 0) {
      qb.andWhere('user.belt IN (:...belts)', { belts });
    }

    // Exclusion filters: LEFT JOIN + IS NULL (faster than NOT IN on large tables)
    this.applyExclusionFilters(qb, { notEnrolledInClass, notInSession });

    // Apply sort
    this.applySorting(qb, sortBy, sortOrder);

    const total = await qb.getCount();

    qb.skip(skip).take(limit);

    const data = await qb.getMany();

    return { data, total, page, limit };
  }

  /**
   * Soft-delete a user by id.
   * TypeORM sets deleted_at = NOW(); subsequent default finds exclude this row.
   */
  async softDelete(id: string): Promise<void> {
    await this.usersRepository.softDelete(id);
  }

  /**
   * Restore a previously soft-deleted user.
   */
  async restore(id: string): Promise<void> {
    await this.usersRepository.restore(id);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private applyExclusionFilters(
    qb: SelectQueryBuilder<User>,
    filters: {
      notEnrolledInClass?: string;
      notInSession?: string;
    },
  ): void {
    if (filters.notEnrolledInClass) {
      qb.leftJoin(
        'class_enrollments',
        'ce',
        'ce.user_id = user.id AND ce.class_id = :classId',
        { classId: filters.notEnrolledInClass },
      ).andWhere('ce.class_id IS NULL');
    }

    if (filters.notInSession) {
      qb.leftJoin(
        'attendances',
        'att',
        'att.student_id = user.id AND att.session_id = :sessionId',
        { sessionId: filters.notInSession },
      ).andWhere('att.session_id IS NULL');
    }
  }

  private applySorting(
    qb: SelectQueryBuilder<User>,
    sortBy: 'name' | 'belt' | 'createdAt',
    sortOrder: 'ASC' | 'DESC',
  ): void {
    if (sortBy === 'belt') {
      qb.addSelect(
        `CASE
          WHEN user.belt = '${Belt.WHITE}'  THEN 1
          WHEN user.belt = '${Belt.YELLOW}' THEN 2
          WHEN user.belt = '${Belt.ORANGE}' THEN 3
          WHEN user.belt = '${Belt.GREEN}'  THEN 4
          WHEN user.belt = '${Belt.BLUE}'   THEN 5
          WHEN user.belt = '${Belt.BROWN}'  THEN 6
          WHEN user.belt = '${Belt.BLACK}'  THEN 7
          ELSE 8
        END`,
        'belt_order',
      )
        .orderBy('belt_order', sortOrder)
        .addOrderBy('user.name', 'ASC');
    } else {
      qb.orderBy(`user.${sortBy}`, sortOrder);
    }
  }
}
