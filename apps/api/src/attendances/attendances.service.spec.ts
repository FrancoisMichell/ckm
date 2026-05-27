/**
 * Unit tests for AttendancesService (M7 — added during M9.6 coverage hardening).
 *
 * Uses @suites/unit TestBed.solitary() to isolate the service from its
 * repository dependencies.
 */
import { NotFoundException } from '@nestjs/common';
import { TestBed } from '@suites/unit';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { AttendanceStatus } from '@ckm/contracts';
import { Attendance } from './attendance.entity';
import { ClassSession } from '@/class-sessions/class-session.entity';
import { ClassEnrollment } from '@/classes/entities/class-enrollment.entity';
import { User } from '@/users/entities/user.entity';
import { AttendancesService } from './attendances.service';

describe('AttendancesService', () => {
  let service: AttendancesService;
  let attendancesRepository: jest.Mocked<Repository<Attendance>>;
  let sessionsRepository: jest.Mocked<Repository<ClassSession>>;
  let enrollmentsRepository: jest.Mocked<Repository<ClassEnrollment>>;
  let usersRepository: jest.Mocked<Repository<User>>;
  let dataSource: jest.Mocked<DataSource>;

  const teacherA = 'teacher-aaa';

  const stubAttendance = (
    id: string,
    overrides: Partial<Attendance> = {},
  ): Attendance =>
    ({
      id,
      sessionId: 'sess1',
      studentId: 'stu1',
      status: AttendanceStatus.PENDING,
      isEnrolledClass: true,
      checkedInAt: null,
      notes: null,
      ...overrides,
    }) as Attendance;

  const stubSession = (): ClassSession =>
    ({
      id: 'sess1',
      classId: 'cls1',
    }) as ClassSession;

  /** Build a mock query builder that returns a specific value from getOne(). */
  function mockQb(result: Attendance | ClassSession | null) {
    return {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
      getOne: jest.fn().mockResolvedValue(result),
      getMany: jest.fn().mockResolvedValue(result ? [result] : []),
    } as unknown as SelectQueryBuilder<Attendance>;
  }

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(AttendancesService).compile();
    service = unit;
    attendancesRepository = unitRef.get(
      getRepositoryToken(Attendance) as any,
    ) as unknown as jest.Mocked<Repository<Attendance>>;
    sessionsRepository = unitRef.get(
      getRepositoryToken(ClassSession) as any,
    ) as unknown as jest.Mocked<Repository<ClassSession>>;
    enrollmentsRepository = unitRef.get(
      getRepositoryToken(ClassEnrollment) as any,
    ) as unknown as jest.Mocked<Repository<ClassEnrollment>>;
    usersRepository = unitRef.get(
      getRepositoryToken(User) as any,
    ) as unknown as jest.Mocked<Repository<User>>;
    dataSource = unitRef.get(DataSource) as unknown as jest.Mocked<DataSource>;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // create — idempotent single create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('returns existing row when one already exists (idempotency)', async () => {
      const session = stubSession();
      const existing = stubAttendance('a1');

      // resolveSession
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQb(session),
      );
      // resolveStudent
      (usersRepository.findOne as jest.Mock).mockResolvedValue({ id: 'stu1' });
      // findExistingAttendance
      (attendancesRepository.findOne as jest.Mock).mockResolvedValue(existing);

      const result = await service.create(
        { sessionId: 'sess1', studentId: 'stu1' },
        teacherA,
      );

      expect(result).toBe(existing);
      // The service returned the existing row — no INSERT should have been attempted.
      // The only createQueryBuilder call was on sessionsRepository (resolveSession).
      expect(attendancesRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('creates a new row and computes isEnrolledClass snapshot', async () => {
      const session = stubSession();
      const newRow = stubAttendance('a1', { isEnrolledClass: true });

      // resolveSession
      const sessionQb = mockQb(session);
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        sessionQb,
      );
      // resolveStudent
      (usersRepository.findOne as jest.Mock).mockResolvedValue({ id: 'stu1' });
      // findExistingAttendance (no row yet)
      (attendancesRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(null)    // no existing row
        .mockResolvedValueOnce(newRow); // re-select after insert
      // isStudentEnrolledInClass
      (enrollmentsRepository.findOne as jest.Mock).mockResolvedValue({ id: 'e1' });

      // INSERT query builder
      const insertQb = mockQb(null);
      (attendancesRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        insertQb,
      );

      const result = await service.create(
        { sessionId: 'sess1', studentId: 'stu1' },
        teacherA,
      );

      expect(result).toBe(newRow);
    });

    it('throws NotFoundException when session belongs to another teacher', async () => {
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQb(null),
      );

      await expect(
        service.create({ sessionId: 'sess1', studentId: 'stu1' }, teacherA),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when student belongs to another teacher', async () => {
      const session = stubSession();
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQb(session),
      );
      (usersRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create({ sessionId: 'sess1', studentId: 'stu1' }, teacherA),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // createBulk
  // -------------------------------------------------------------------------

  describe('createBulk', () => {
    it('creates attendance rows for all enrolled students', async () => {
      const session = stubSession();
      const enrollment = { userId: 'stu1', classId: 'cls1' } as ClassEnrollment;
      const attendance = stubAttendance('a1');

      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQb(session),
      );
      (enrollmentsRepository.find as jest.Mock).mockResolvedValue([enrollment]);

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (fn: (manager: any) => Promise<unknown>) => {
          const attendanceRepo = {
            findOne: jest.fn()
              .mockResolvedValueOnce(null)    // no existing row
              .mockResolvedValueOnce(attendance), // after insert
            createQueryBuilder: jest.fn().mockReturnValue(mockQb(null)),
          };
          const manager = { getRepository: jest.fn().mockReturnValue(attendanceRepo) };
          return fn(manager);
        },
      );

      const result = await service.createBulk('sess1', teacherA);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(attendance);
    });

    it('returns existing rows unchanged on re-run (isEnrolledClass audit snapshot preserved)', async () => {
      const session = stubSession();
      const enrollment = { userId: 'stu1', classId: 'cls1' } as ClassEnrollment;
      // Existing row with isEnrolledClass=true (was enrolled when first created)
      const existing = stubAttendance('a1', { isEnrolledClass: true });

      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQb(session),
      );
      (enrollmentsRepository.find as jest.Mock).mockResolvedValue([enrollment]);

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (fn: (manager: any) => Promise<unknown>) => {
          const attendanceRepo = {
            findOne: jest.fn().mockResolvedValue(existing), // already exists
            createQueryBuilder: jest.fn(),
          };
          const manager = { getRepository: jest.fn().mockReturnValue(attendanceRepo) };
          return fn(manager);
        },
      );

      const result = await service.createBulk('sess1', teacherA);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(existing);
      // The existing row's isEnrolledClass must not have been mutated
      expect(result[0].isEnrolledClass).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Status shortcuts
  // -------------------------------------------------------------------------

  describe('markPresent', () => {
    it('sets status to PRESENT and checkedInAt to a Date', async () => {
      const attendance = stubAttendance('a1', { checkedInAt: null });
      const qb = mockQb(attendance);
      (attendancesRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      (attendancesRepository.save as jest.Mock).mockImplementation(async (a) => a);

      const result = await service.markPresent('a1', teacherA);

      expect(result.status).toBe(AttendanceStatus.PRESENT);
      expect(result.checkedInAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException when cross-teacher', async () => {
      const qb = mockQb(null);
      (attendancesRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await expect(
        service.markPresent('a1', teacherA),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('markLate', () => {
    it('sets status to LATE and checkedInAt to a Date', async () => {
      const attendance = stubAttendance('a1');
      const qb = mockQb(attendance);
      (attendancesRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      (attendancesRepository.save as jest.Mock).mockImplementation(async (a) => a);

      const result = await service.markLate('a1', teacherA);

      expect(result.status).toBe(AttendanceStatus.LATE);
      expect(result.checkedInAt).toBeInstanceOf(Date);
    });
  });

  describe('markAbsent', () => {
    it('sets status to ABSENT and clears checkedInAt', async () => {
      const attendance = stubAttendance('a1', { checkedInAt: new Date() });
      const qb = mockQb(attendance);
      (attendancesRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      (attendancesRepository.save as jest.Mock).mockImplementation(async (a) => a);

      const result = await service.markAbsent('a1', teacherA);

      expect(result.status).toBe(AttendanceStatus.ABSENT);
      expect(result.checkedInAt).toBeNull();
    });
  });

  describe('markExcused', () => {
    it('sets status to EXCUSED and clears checkedInAt', async () => {
      const attendance = stubAttendance('a1', { checkedInAt: new Date() });
      const qb = mockQb(attendance);
      (attendancesRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      (attendancesRepository.save as jest.Mock).mockImplementation(async (a) => a);

      const result = await service.markExcused('a1', teacherA);

      expect(result.status).toBe(AttendanceStatus.EXCUSED);
      expect(result.checkedInAt).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findAll
  // -------------------------------------------------------------------------

  describe('findAll', () => {
    it('returns attendance rows for the calling teacher', async () => {
      const attendances = [stubAttendance('a1')];
      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(attendances),
      };
      (attendancesRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.findAll({}, teacherA);

      expect(result).toBe(attendances);
    });

    it('applies sessionId filter when provided', async () => {
      const attendances = [stubAttendance('a1')];
      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(attendances),
      };
      (attendancesRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await service.findAll({ sessionId: 'sess1' }, teacherA);

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('session_id'),
        expect.objectContaining({ sessionId: 'sess1' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // updateNotes
  // -------------------------------------------------------------------------

  describe('updateNotes', () => {
    it('updates notes and saves', async () => {
      const attendance = stubAttendance('a1', { notes: null });
      const qb = mockQb(attendance);
      (attendancesRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      (attendancesRepository.save as jest.Mock).mockImplementation(async (a) => a);

      const result = await service.updateNotes(
        'a1',
        { notes: 'Great session' },
        teacherA,
      );

      expect(result.notes).toBe('Great session');
    });

    it('clears notes when null is passed', async () => {
      const attendance = stubAttendance('a1', { notes: 'Old note' });
      const qb = mockQb(attendance);
      (attendancesRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      (attendancesRepository.save as jest.Mock).mockImplementation(async (a) => a);

      const result = await service.updateNotes('a1', { notes: null }, teacherA);

      expect(result.notes).toBeNull();
    });
  });
});
