import { TestBed } from '@suites/unit';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Belt, UserRoleType } from '@ckm/contracts';
import { User } from '@/users/entities/user.entity';
import { UsersService } from '@/users/users.service';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { QueryStudentsDto } from './dto/query-students.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

describe('StudentsService', () => {
  let service: StudentsService;
  let usersService: jest.Mocked<UsersService>;
  let usersRepository: jest.Mocked<Repository<User>>;

  const teacherA = 'teacher-aaa';
  const teacherB = 'teacher-bbb';

  /** Build a fully-populated User stub belonging to `instructorId`. */
  const stubStudent = (
    id: string,
    instructorId: string | null = teacherA,
  ): User =>
    ({
      id,
      name: 'Stub',
      registry: 'R-' + id,
      belt: Belt.WHITE,
      instructor: instructorId ? ({ id: instructorId } as User) : null,
      roles: [{ role: UserRoleType.STUDENT } as any],
    }) as unknown as User;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(StudentsService).compile();
    service = unit;
    usersService = unitRef.get(UsersService) as any;
    usersRepository = unitRef.get(getRepositoryToken(User) as any) as any;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('forwards instructor.id from currentTeacherId, never trusts a DTO field', async () => {
      const dto: CreateStudentDto = {
        name: 'Aluno Novo',
        registry: 'S-0001',
        belt: Belt.WHITE,
      };

      const saved = stubStudent('u1', teacherA);
      (usersService.create as jest.Mock).mockResolvedValue(saved);

      const result = await service.create(dto, teacherA);

      expect(result).toBe(saved);
      expect(usersService.create).toHaveBeenCalledTimes(1);
      const [payload, roles] = (usersService.create as jest.Mock).mock
        .calls[0] as [Partial<User>, UserRoleType[]];
      expect(payload.name).toBe(dto.name);
      expect(payload.registry).toBe(dto.registry);
      expect(payload.instructor).toEqual({ id: teacherA });
      expect(roles).toEqual([UserRoleType.STUDENT]);
    });
  });

  // -------------------------------------------------------------------------
  // findAll — delegates to UsersService.findByRole with the teacher scope
  // -------------------------------------------------------------------------

  describe('findAll', () => {
    it('delegates to UsersService.findByRole(STUDENT, query, currentTeacherId)', async () => {
      const query = new QueryStudentsDto();
      const payload = { data: [], total: 0, page: 1, limit: 10 };
      (usersService.findByRole as jest.Mock).mockResolvedValue(payload);

      const result = await service.findAll(query, teacherA);

      expect(result).toBe(payload);
      expect(usersService.findByRole).toHaveBeenCalledWith(
        UserRoleType.STUDENT,
        query,
        teacherA,
      );
    });

    it('does not pass the OTHER teacher id even when query is reused', async () => {
      // instructor-isolation: two calls with the same query, different teachers
      // must produce distinct calls scoped per teacher. (This catches accidental
      // closure capture of teacherId or static fields.)
      const query = new QueryStudentsDto();
      (usersService.findByRole as jest.Mock).mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
      });

      await service.findAll(query, teacherA);
      await service.findAll(query, teacherB);

      const calls = (usersService.findByRole as jest.Mock).mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0][2]).toBe(teacherA);
      expect(calls[1][2]).toBe(teacherB);
    });

    it('throws NotFoundException when notEnrolledInClass references a non-existent class', async () => {
      const query = new QueryStudentsDto();
      query.notEnrolledInClass = '00000000-0000-4000-8000-000000000000';
      (usersRepository.query as jest.Mock).mockResolvedValue([]);

      await expect(service.findAll(query, teacherA)).rejects.toThrow(
        NotFoundException,
      );
      expect(usersService.findByRole).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when notInSession references a non-existent session', async () => {
      const query = new QueryStudentsDto();
      query.notInSession = '00000000-0000-4000-8000-000000000000';
      (usersRepository.query as jest.Mock).mockResolvedValue([]);

      await expect(service.findAll(query, teacherA)).rejects.toThrow(
        NotFoundException,
      );
      expect(usersService.findByRole).not.toHaveBeenCalled();
    });

    it('scopes the notEnrolledInClass existence check to the calling teacher', async () => {
      const query = new QueryStudentsDto();
      const classId = '11111111-1111-4000-8000-000000000000';
      query.notEnrolledInClass = classId;
      (usersRepository.query as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      (usersService.findByRole as jest.Mock).mockResolvedValue({
        data: [],
        meta: {},
      });

      await service.findAll(query, teacherA);

      const [sql, params] = (usersRepository.query as jest.Mock).mock.calls[0];
      expect(sql).toMatch(/teacher_id\s*=\s*\$2/);
      expect(params).toEqual([classId, teacherA]);
    });

    it('scopes the notInSession existence check to the calling teacher via parent class', async () => {
      const query = new QueryStudentsDto();
      const sessionId = '22222222-2222-4000-8000-000000000000';
      query.notInSession = sessionId;
      (usersRepository.query as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      (usersService.findByRole as jest.Mock).mockResolvedValue({
        data: [],
        meta: {},
      });

      await service.findAll(query, teacherA);

      const [sql, params] = (usersRepository.query as jest.Mock).mock.calls[0];
      expect(sql).toMatch(/join\s+classes/i);
      expect(sql).toMatch(/c\.teacher_id\s*=\s*\$2/);
      expect(params).toEqual([sessionId, teacherA]);
    });

    it('returns 404 for a foreign teacher’s classId (existence is scoped, not leaked)', async () => {
      const query = new QueryStudentsDto();
      query.notEnrolledInClass = 'teacher-b-class-id';
      // The scoped query finds nothing because the row belongs to teacherB.
      (usersRepository.query as jest.Mock).mockResolvedValue([]);

      await expect(service.findAll(query, teacherA)).rejects.toThrow(
        NotFoundException,
      );
      const [, params] = (usersRepository.query as jest.Mock).mock.calls[0];
      expect(params).toEqual(['teacher-b-class-id', teacherA]);
      expect(usersService.findByRole).not.toHaveBeenCalled();
    });

    it('returns 404 for a foreign teacher’s sessionId (existence is scoped, not leaked)', async () => {
      const query = new QueryStudentsDto();
      query.notInSession = 'teacher-b-session-id';
      (usersRepository.query as jest.Mock).mockResolvedValue([]);

      await expect(service.findAll(query, teacherA)).rejects.toThrow(
        NotFoundException,
      );
      const [, params] = (usersRepository.query as jest.Mock).mock.calls[0];
      expect(params).toEqual(['teacher-b-session-id', teacherA]);
      expect(usersService.findByRole).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // findOne — teacher-isolation 404 contract
  // -------------------------------------------------------------------------

  describe('findOne (teacher isolation)', () => {
    it('returns the student when owned by the calling teacher', async () => {
      const s = stubStudent('u1', teacherA);
      (usersRepository.findOne as jest.Mock).mockResolvedValue(s);

      await expect(service.findOne('u1', teacherA)).resolves.toBe(s);
    });

    it('throws NotFoundException (NOT ForbiddenException) when row is owned by another teacher', async () => {
      const s = stubStudent('u1', teacherB);
      (usersRepository.findOne as jest.Mock).mockResolvedValue(s);

      await expect(service.findOne('u1', teacherA)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException when row does not exist', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('nope', teacherA)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException when row exists but lacks the STUDENT role', async () => {
      const teacherEntity = {
        id: 'tA',
        instructor: { id: teacherA } as User,
        roles: [{ role: UserRoleType.TEACHER } as any],
      } as unknown as User;
      (usersRepository.findOne as jest.Mock).mockResolvedValue(teacherEntity);

      await expect(service.findOne('tA', teacherA)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // update — re-uses findOne guard for tenant isolation
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('updates after passing the tenant guard', async () => {
      const s = stubStudent('u1', teacherA);
      (usersRepository.findOne as jest.Mock).mockResolvedValue(s);
      const patched = { ...s, name: 'New' } as User;
      (usersService.update as jest.Mock).mockResolvedValue(patched);

      const dto: UpdateStudentDto = { name: 'New' };
      const result = await service.update('u1', dto, teacherA);

      expect(result).toBe(patched);
      expect(usersService.update).toHaveBeenCalledWith('u1', dto);
    });

    it('throws NotFoundException without invoking UsersService.update when cross-teacher', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(
        stubStudent('u1', teacherB),
      );

      await expect(
        service.update('u1', { name: 'X' }, teacherA),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(usersService.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // softDelete / restore — tenant-guarded
  // -------------------------------------------------------------------------

  describe('softDelete', () => {
    it('soft-deletes when owned by the calling teacher', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(
        stubStudent('u1', teacherA),
      );
      (usersService.softDelete as jest.Mock).mockResolvedValue(undefined);

      await service.softDelete('u1', teacherA);

      expect(usersService.softDelete).toHaveBeenCalledWith('u1');
    });

    it('throws NotFoundException without deleting when cross-teacher', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(
        stubStudent('u1', teacherB),
      );

      await expect(
        service.softDelete('u1', teacherA),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(usersService.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('uses withDeleted: true so soft-deleted rows are visible to the tenant check', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(
        stubStudent('u1', teacherA),
      );
      (usersService.restore as jest.Mock).mockResolvedValue(undefined);

      await service.restore('u1', teacherA);

      expect(usersRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ withDeleted: true }),
      );
      expect(usersService.restore).toHaveBeenCalledWith('u1');
    });

    it('throws NotFoundException without restoring when cross-teacher', async () => {
      (usersRepository.findOne as jest.Mock).mockResolvedValue(
        stubStudent('u1', teacherB),
      );

      await expect(
        service.restore('u1', teacherA),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(usersService.restore).not.toHaveBeenCalled();
    });
  });
});
