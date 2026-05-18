import { TestBed } from '@suites/unit';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Belt, UserRoleType } from '@ckm/contracts';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UserRole } from './entities/user-role.entity';
import { PasswordService } from '@/common/utils/password.service';
import { QueryUsersDto } from './dto/query-users.dto';

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: jest.Mocked<Repository<User>>;
  let userRolesRepository: jest.Mocked<Repository<UserRole>>;
  let passwordService: jest.Mocked<PasswordService>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(UsersService).compile();
    service = unit;
    usersRepository = unitRef.get(getRepositoryToken(User) as any) as any;
    userRolesRepository = unitRef.get(getRepositoryToken(UserRole) as any) as any;
    passwordService = unitRef.get(PasswordService) as any;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('should hash password and save user with roles', async () => {
      const userData: Partial<User> = {
        name: 'John Doe',
        registry: '12345',
        password: 'plaintext',
        belt: Belt.WHITE,
      };
      const roles = [UserRoleType.STUDENT];

      const createdRole = {
        id: 'role-1',
        role: UserRoleType.STUDENT,
      } as UserRole;

      const savedUser = {
        id: 'user-1',
        name: 'John Doe',
        registry: '12345',
        password: '$2b$10$hashed',
        belt: Belt.WHITE,
        roles: [createdRole],
      } as unknown as User;

      (passwordService.hashPassword as jest.Mock).mockResolvedValue('$2b$10$hashed');
      (userRolesRepository.create as jest.Mock).mockReturnValue(createdRole);
      (usersRepository.create as jest.Mock).mockReturnValue(savedUser);
      (usersRepository.save as jest.Mock).mockResolvedValue(savedUser);
      (usersRepository.findOne as jest.Mock).mockResolvedValue(savedUser);

      const result = await service.create(userData, roles);

      expect(passwordService.hashPassword).toHaveBeenCalledWith('plaintext');
      expect(usersRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result?.roles).toHaveLength(1);
      expect(result?.roles[0].role).toBe(UserRoleType.STUDENT);
    });

    it('should not hash password when password is absent', async () => {
      const userData: Partial<User> = {
        name: 'No Password User',
        registry: '99999',
        belt: Belt.BLUE,
      };
      const roles = [UserRoleType.STUDENT];

      const savedUser = {
        id: 'user-2',
        name: 'No Password User',
        registry: '99999',
        belt: Belt.BLUE,
        roles: [],
      } as unknown as User;

      (usersRepository.create as jest.Mock).mockReturnValue(savedUser);
      (usersRepository.save as jest.Mock).mockResolvedValue(savedUser);
      (usersRepository.findOne as jest.Mock).mockResolvedValue(savedUser);

      await service.create(userData, roles);

      expect(passwordService.hashPassword).not.toHaveBeenCalled();
    });

    it('should cascade-create multiple roles', async () => {
      const userData: Partial<User> = {
        name: 'Teacher User',
        registry: '77777',
        password: 'pass',
        belt: Belt.BLACK,
      };
      const roles = [UserRoleType.STUDENT, UserRoleType.TEACHER];

      const studentRole = { id: 'r1', role: UserRoleType.STUDENT } as UserRole;
      const teacherRole = { id: 'r2', role: UserRoleType.TEACHER } as UserRole;
      const savedUser = {
        id: 'u1',
        ...userData,
        roles: [studentRole, teacherRole],
      } as unknown as User;

      (passwordService.hashPassword as jest.Mock).mockResolvedValue('$2b$10$hashed');
      (userRolesRepository.create as jest.Mock)
        .mockReturnValueOnce(studentRole)
        .mockReturnValueOnce(teacherRole);
      (usersRepository.create as jest.Mock).mockReturnValue(savedUser);
      (usersRepository.save as jest.Mock).mockResolvedValue(savedUser);
      (usersRepository.findOne as jest.Mock).mockResolvedValue(savedUser);

      const result = await service.create(userData, roles);

      expect(result?.roles).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // findByRegistry
  // -------------------------------------------------------------------------

  describe('findByRegistry', () => {
    it('should return user with roles when found', async () => {
      const mockUser = {
        id: 'u1',
        registry: '12345',
        roles: [{ role: UserRoleType.STUDENT }],
      } as unknown as User;

      (usersRepository.findOne as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.findByRegistry('12345');

      expect(result).toBeDefined();
      expect(result?.registry).toBe('12345');
      expect(usersRepository.findOne).toHaveBeenCalledWith({
        where: { registry: '12345' },
        relations: ['roles'],
      });
    });

    it('should return null for non-existing registry', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.findByRegistry('does-not-exist');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  describe('findById', () => {
    it('should return user with roles and instructor when found', async () => {
      const mockUser = {
        id: 'u1',
        name: 'Test User',
        roles: [{ role: UserRoleType.STUDENT }],
        instructor: null,
      } as unknown as User;

      (usersRepository.findOne as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.findById('u1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('u1');
      expect(usersRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'u1' },
        relations: ['roles', 'instructor'],
      });
    });

    it('should return null for non-existing id', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('should update user and return updated entity', async () => {
      const updatedUser = {
        id: 'u1',
        name: 'Updated Name',
        belt: Belt.BLUE,
        roles: [],
        instructor: null,
      } as unknown as User;

      (usersRepository.update as jest.Mock).mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });
      (usersRepository.findOne as jest.Mock).mockResolvedValue(updatedUser);

      const result = await service.update('u1', { name: 'Updated Name', belt: Belt.BLUE });

      expect(usersRepository.update).toHaveBeenCalledWith('u1', {
        name: 'Updated Name',
        belt: Belt.BLUE,
      });
      expect(result?.name).toBe('Updated Name');
      expect(result?.belt).toBe(Belt.BLUE);
    });

    it('should return null when user does not exist', async () => {
      (usersRepository.update as jest.Mock).mockResolvedValue({
        affected: 0,
        raw: [],
        generatedMaps: [],
      });
      (usersRepository.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.update('non-existent', { name: 'X' });

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findByRole (basic pagination)
  // -------------------------------------------------------------------------

  describe('findByRole', () => {
    function makeQb(): Partial<SelectQueryBuilder<User>> {
      return {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getMany: jest.fn().mockResolvedValue([]),
      };
    }

    it('should return paginated response with default pagination', async () => {
      const qb = makeQb();
      (qb.getCount as jest.Mock).mockResolvedValue(2);
      (qb.getMany as jest.Mock).mockResolvedValue([
        { id: '1', name: 'A' } as unknown as User,
        { id: '2', name: 'B' } as unknown as User,
      ]);
      (usersRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        qb as SelectQueryBuilder<User>,
      );

      const result = await service.findByRole(
        UserRoleType.STUDENT,
        new QueryUsersDto(),
      );

      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.data).toHaveLength(2);
    });

    it('should apply name filter', async () => {
      const qb = makeQb();
      (usersRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        qb as SelectQueryBuilder<User>,
      );

      const dto = new QueryUsersDto();
      dto.name = 'John';
      await service.findByRole(UserRoleType.STUDENT, dto);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'LOWER(user.name) LIKE LOWER(:name)',
        { name: '%John%' },
      );
    });

    it('should apply belt filter', async () => {
      const qb = makeQb();
      (usersRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        qb as SelectQueryBuilder<User>,
      );

      const dto = new QueryUsersDto();
      dto.belts = [Belt.WHITE, Belt.BLUE];
      await service.findByRole(UserRoleType.STUDENT, dto);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'user.belt IN (:...belts)',
        { belts: [Belt.WHITE, Belt.BLUE] },
      );
    });

    it('should scope by teacherId when provided', async () => {
      const qb = makeQb();
      (usersRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        qb as SelectQueryBuilder<User>,
      );

      await service.findByRole(
        UserRoleType.STUDENT,
        new QueryUsersDto(),
        'teacher-123',
      );

      expect(qb.andWhere).toHaveBeenCalledWith(
        'user.instructor_id = :teacherId',
        { teacherId: 'teacher-123' },
      );
    });

    it('should apply notEnrolledInClass exclusion filter', async () => {
      const qb = makeQb();
      (usersRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        qb as SelectQueryBuilder<User>,
      );

      const dto = new QueryUsersDto();
      dto.notEnrolledInClass = 'class-uuid-123';
      await service.findByRole(UserRoleType.STUDENT, dto);

      expect(qb.leftJoin).toHaveBeenCalledWith(
        'class_enrollments',
        'ce',
        'ce.user_id = user.id AND ce.class_id = :classId',
        { classId: 'class-uuid-123' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('ce.class_id IS NULL');
    });

    it('should apply notInSession exclusion filter', async () => {
      const qb = makeQb();
      (usersRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        qb as SelectQueryBuilder<User>,
      );

      const dto = new QueryUsersDto();
      dto.notInSession = 'session-uuid-456';
      await service.findByRole(UserRoleType.STUDENT, dto);

      expect(qb.leftJoin).toHaveBeenCalledWith(
        'attendances',
        'att',
        'att.student_id = user.id AND att.session_id = :sessionId',
        { sessionId: 'session-uuid-456' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('att.session_id IS NULL');
    });

    it('should use belt-rank CASE sort when sortBy = belt', async () => {
      const qb = makeQb();
      (usersRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        qb as SelectQueryBuilder<User>,
      );

      const dto = new QueryUsersDto();
      dto.sortBy = 'belt';
      dto.sortOrder = 'ASC';
      await service.findByRole(UserRoleType.STUDENT, dto);

      expect(qb.addSelect).toHaveBeenCalled();
      expect(qb.orderBy).toHaveBeenCalledWith('belt_order', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('user.name', 'ASC');
    });
  });

  // -------------------------------------------------------------------------
  // softDelete
  // -------------------------------------------------------------------------

  describe('softDelete', () => {
    it('should call usersRepository.softDelete with the id', async () => {
      (usersRepository.softDelete as jest.Mock).mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });

      await service.softDelete('u1');

      expect(usersRepository.softDelete).toHaveBeenCalledWith('u1');
    });
  });

  // -------------------------------------------------------------------------
  // restore
  // -------------------------------------------------------------------------

  describe('restore', () => {
    it('should call usersRepository.restore with the id', async () => {
      (usersRepository.restore as jest.Mock).mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });

      await service.restore('u1');

      expect(usersRepository.restore).toHaveBeenCalledWith('u1');
    });
  });

  // -------------------------------------------------------------------------
  // soft-delete + default find behavior
  // -------------------------------------------------------------------------

  describe('soft-delete behavior', () => {
    it('should return null for a soft-deleted user (TypeORM auto-filters deleted rows)', async () => {
      // TypeORM's WHERE deleted_at IS NULL is applied automatically on findOne.
      // Simulate that behavior: after soft-delete, findOne returns null.
      (usersRepository.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.findById('soft-deleted-id');

      expect(result).toBeNull();
    });
  });
});
