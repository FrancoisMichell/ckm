/**
 * Unit tests for ClassesService (M5 — added during M9.6 coverage hardening).
 *
 * Uses @suites/unit TestBed.solitary() to isolate the service from its
 * repository and DataSource dependencies.
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TestBed } from '@suites/unit';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Belt } from '@ckm/contracts';
import { Class } from './entities/class.entity';
import { ClassEnrollment } from './entities/class-enrollment.entity';
import { User } from '@/users/entities/user.entity';
import { ClassesService } from './classes.service';
import { CreateClassDto, DayOfWeekValue } from './dto/create-class.dto';

describe('ClassesService', () => {
  let service: ClassesService;
  let classesRepository: jest.Mocked<Repository<Class>>;
  let enrollmentsRepository: jest.Mocked<Repository<ClassEnrollment>>;
  let usersRepository: jest.Mocked<Repository<User>>;
  let dataSource: jest.Mocked<DataSource>;

  const teacherA = 'teacher-aaa';
  const teacherB = 'teacher-bbb';

  const stubClass = (id: string, teacherId: string = teacherA): Class =>
    ({
      id,
      name: 'Turma ' + id,
      teacherId,
      deletedAt: null,
    }) as Class;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(ClassesService).compile();
    service = unit;
    classesRepository = unitRef.get(
      getRepositoryToken(Class) as any,
    ) as unknown as jest.Mocked<Repository<Class>>;
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
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('saves a new class with the calling teacher id', async () => {
      const dto: CreateClassDto = {
        name: 'BJJ Fundamentals',
        days: [DayOfWeekValue.MONDAY],
        startTime: '08:00',
        durationMinutes: 60,
        belt: Belt.WHITE,
      };
      const saved = stubClass('cls1', teacherA);
      (classesRepository.create as jest.Mock).mockReturnValue(saved);
      (classesRepository.save as jest.Mock).mockResolvedValue(saved);

      const result = await service.create(dto, teacherA);

      expect(result).toBe(saved);
      expect(classesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ teacherId: teacherA }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // findAll
  // -------------------------------------------------------------------------

  describe('findAll', () => {
    it('returns only classes owned by the calling teacher', async () => {
      const classes = [stubClass('c1', teacherA), stubClass('c2', teacherA)];
      (classesRepository.find as jest.Mock).mockResolvedValue(classes);

      const result = await service.findAll(teacherA);

      expect(result).toBe(classes);
      expect(classesRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { teacherId: teacherA },
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // findOne — teacher isolation
  // -------------------------------------------------------------------------

  describe('findOne', () => {
    it('returns the class when owned by the calling teacher', async () => {
      const cls = stubClass('c1', teacherA);
      (classesRepository.findOne as jest.Mock).mockResolvedValue(cls);

      await expect(service.findOne('c1', teacherA)).resolves.toBe(cls);
    });

    it('throws NotFoundException when the class belongs to another teacher', async () => {
      const cls = stubClass('c1', teacherB);
      (classesRepository.findOne as jest.Mock).mockResolvedValue(cls);

      await expect(service.findOne('c1', teacherA)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the class does not exist', async () => {
      (classesRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('nope', teacherA)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('updates fields and saves when teacher-scoped', async () => {
      const cls = stubClass('c1', teacherA);
      (classesRepository.findOne as jest.Mock).mockResolvedValue(cls);
      (classesRepository.save as jest.Mock).mockResolvedValue({
        ...cls,
        name: 'Updated',
      } as Class);

      const result = await service.update('c1', { name: 'Updated' }, teacherA);

      expect(result.name).toBe('Updated');
      expect(classesRepository.save).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException without saving when cross-teacher', async () => {
      (classesRepository.findOne as jest.Mock).mockResolvedValue(
        stubClass('c1', teacherB),
      );

      await expect(
        service.update('c1', { name: 'X' }, teacherA),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(classesRepository.save).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // softDelete
  // -------------------------------------------------------------------------

  describe('softDelete', () => {
    it('soft-removes the class when owned by the calling teacher', async () => {
      const cls = stubClass('c1', teacherA);
      (classesRepository.findOne as jest.Mock).mockResolvedValue(cls);
      (classesRepository.softRemove as jest.Mock).mockResolvedValue(cls);

      await service.softDelete('c1', teacherA);

      expect(classesRepository.softRemove).toHaveBeenCalledWith(cls);
    });

    it('throws NotFoundException without soft-removing when cross-teacher', async () => {
      (classesRepository.findOne as jest.Mock).mockResolvedValue(
        stubClass('c1', teacherB),
      );

      await expect(
        service.softDelete('c1', teacherA),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(classesRepository.softRemove).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // restore
  // -------------------------------------------------------------------------

  describe('restore', () => {
    it('restores a soft-deleted class when teacher-scoped', async () => {
      const cls = { ...stubClass('c1', teacherA), deletedAt: new Date() } as Class;
      (classesRepository.findOne as jest.Mock).mockResolvedValue(cls);
      (classesRepository.restore as jest.Mock).mockResolvedValue(undefined);

      await service.restore('c1', teacherA);

      expect(classesRepository.restore).toHaveBeenCalledWith('c1');
    });

    it('throws NotFoundException when cross-teacher (with withDeleted: true)', async () => {
      const cls = {
        ...stubClass('c1', teacherB),
        deletedAt: new Date(),
      } as Class;
      (classesRepository.findOne as jest.Mock).mockResolvedValue(cls);

      await expect(
        service.restore('c1', teacherA),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(classesRepository.restore).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // enroll
  // -------------------------------------------------------------------------

  describe('enroll', () => {
    it('creates a new enrollment when none exists', async () => {
      const cls = stubClass('c1', teacherA);
      const student = { id: 's1' } as User;
      const enrollment = { id: 'e1', classId: 'c1', userId: 's1' } as ClassEnrollment;

      (classesRepository.findOne as jest.Mock).mockResolvedValue(cls);
      (usersRepository.findOne as jest.Mock).mockResolvedValue(student);

      // Mock the transaction so it runs the callback synchronously
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (fn: (manager: any) => Promise<unknown>) => {
          const enrollRepo = {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockReturnValue(enrollment),
            save: jest.fn().mockResolvedValue(enrollment),
            restore: jest.fn(),
            findOneOrFail: jest.fn(),
          };
          const manager = {
            getRepository: jest.fn().mockReturnValue(enrollRepo),
          };
          return fn(manager);
        },
      );

      const result = await service.enroll('c1', 's1', teacherA);

      expect(result).toBe(enrollment);
    });

    it('throws ConflictException when student is already actively enrolled', async () => {
      const cls = stubClass('c1', teacherA);
      const student = { id: 's1' } as User;
      const existing = { id: 'e1', classId: 'c1', userId: 's1', deletedAt: null } as ClassEnrollment;

      (classesRepository.findOne as jest.Mock).mockResolvedValue(cls);
      (usersRepository.findOne as jest.Mock).mockResolvedValue(student);

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (fn: (manager: any) => Promise<unknown>) => {
          const enrollRepo = {
            findOne: jest.fn().mockResolvedValue(existing),
          };
          const manager = {
            getRepository: jest.fn().mockReturnValue(enrollRepo),
          };
          return fn(manager);
        },
      );

      await expect(
        service.enroll('c1', 's1', teacherA),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('restores a soft-deleted enrollment when re-enrolling', async () => {
      const cls = stubClass('c1', teacherA);
      const student = { id: 's1' } as User;
      const softDeleted = {
        id: 'e1',
        classId: 'c1',
        userId: 's1',
        deletedAt: new Date(),
      } as ClassEnrollment;
      const restored = { ...softDeleted, deletedAt: null } as ClassEnrollment;

      (classesRepository.findOne as jest.Mock).mockResolvedValue(cls);
      (usersRepository.findOne as jest.Mock).mockResolvedValue(student);

      (dataSource.transaction as jest.Mock).mockImplementation(
        async (fn: (manager: any) => Promise<unknown>) => {
          const enrollRepo = {
            findOne: jest.fn().mockResolvedValue(softDeleted),
            restore: jest.fn().mockResolvedValue(undefined),
            findOneOrFail: jest.fn().mockResolvedValue(restored),
          };
          const manager = {
            getRepository: jest.fn().mockReturnValue(enrollRepo),
          };
          return fn(manager);
        },
      );

      const result = await service.enroll('c1', 's1', teacherA);

      expect(result).toBe(restored);
    });

    it('throws NotFoundException when student belongs to another teacher', async () => {
      const cls = stubClass('c1', teacherA);
      (classesRepository.findOne as jest.Mock).mockResolvedValue(cls);
      (usersRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.enroll('c1', 's1', teacherA),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // unenroll
  // -------------------------------------------------------------------------

  describe('unenroll', () => {
    it('soft-removes the enrollment when found', async () => {
      const cls = stubClass('c1', teacherA);
      const enrollment = { id: 'e1' } as ClassEnrollment;

      (classesRepository.findOne as jest.Mock).mockResolvedValue(cls);
      (enrollmentsRepository.findOne as jest.Mock).mockResolvedValue(enrollment);
      (enrollmentsRepository.softRemove as jest.Mock).mockResolvedValue(
        enrollment,
      );

      await service.unenroll('c1', 's1', teacherA);

      expect(enrollmentsRepository.softRemove).toHaveBeenCalledWith(enrollment);
    });

    it('throws NotFoundException when active enrollment not found', async () => {
      const cls = stubClass('c1', teacherA);
      (classesRepository.findOne as jest.Mock).mockResolvedValue(cls);
      (enrollmentsRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.unenroll('c1', 's1', teacherA),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(enrollmentsRepository.softRemove).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // findEnrollments
  // -------------------------------------------------------------------------

  describe('findEnrollments', () => {
    it('returns active enrollments for the class when teacher-scoped', async () => {
      const cls = stubClass('c1', teacherA);
      const enrollments = [{ id: 'e1' }] as ClassEnrollment[];

      (classesRepository.findOne as jest.Mock).mockResolvedValue(cls);
      (enrollmentsRepository.find as jest.Mock).mockResolvedValue(enrollments);

      const result = await service.findEnrollments('c1', teacherA);

      expect(result).toBe(enrollments);
    });

    it('throws NotFoundException when class is cross-teacher', async () => {
      (classesRepository.findOne as jest.Mock).mockResolvedValue(
        stubClass('c1', teacherB),
      );

      await expect(
        service.findEnrollments('c1', teacherA),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
