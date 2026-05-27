/**
 * Unit tests for ClassSessionsService (M6 — added during M9.6 coverage hardening).
 *
 * Uses @suites/unit TestBed.solitary() to isolate the service from its
 * repository and ClassesService dependencies.
 */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TestBed } from '@suites/unit';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ClassSession } from './class-session.entity';
import { ClassesService } from '@/classes/classes.service';
import { ClassSessionsService } from './class-sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';

describe('ClassSessionsService', () => {
  let service: ClassSessionsService;
  let sessionsRepository: jest.Mocked<Repository<ClassSession>>;
  let classesService: jest.Mocked<ClassesService>;

  const teacherA = 'teacher-aaa';
  const teacherB = 'teacher-bbb';

  const stubSession = (
    id: string,
    overrides: Partial<ClassSession> = {},
  ): ClassSession =>
    ({
      id,
      classId: 'cls1',
      date: '2026-01-15',
      startTime: null,
      endTime: null,
      deletedAt: null,
      notes: null,
      ...overrides,
    }) as ClassSession;

  /** Build a mock query builder that returns a specific result from getOne(). */
  function mockQb(result: ClassSession | null): jest.Mocked<SelectQueryBuilder<ClassSession>> {
    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      withDeleted: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(result),
      getMany: jest.fn().mockResolvedValue(result !== null ? [result] : []),
    } as unknown as jest.Mocked<SelectQueryBuilder<ClassSession>>;
    return qb;
  }

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(ClassSessionsService).compile();
    service = unit;
    sessionsRepository = unitRef.get(
      getRepositoryToken(ClassSession) as any,
    ) as unknown as jest.Mocked<Repository<ClassSession>>;
    classesService = unitRef.get(ClassesService) as unknown as jest.Mocked<ClassesService>;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('creates a session after verifying class ownership', async () => {
      const dto: CreateSessionDto = {
        classId: 'cls1',
        date: '2026-01-15',
      };
      const session = stubSession('sess1');
      (classesService.findOne as jest.Mock).mockResolvedValue({ id: 'cls1' });
      (sessionsRepository.create as jest.Mock).mockReturnValue(session);
      (sessionsRepository.save as jest.Mock).mockResolvedValue(session);

      const result = await service.create(dto, teacherA);

      expect(result).toBe(session);
      expect(classesService.findOne).toHaveBeenCalledWith('cls1', teacherA);
    });

    it('throws NotFoundException when class belongs to another teacher', async () => {
      (classesService.findOne as jest.Mock).mockRejectedValue(
        new NotFoundException('Class not found'),
      );

      await expect(
        service.create({ classId: 'cls1', date: '2026-01-15' }, teacherA),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // findOne — teacher isolation
  // -------------------------------------------------------------------------

  describe('findOne', () => {
    it('returns the session when owned by the calling teacher', async () => {
      const session = stubSession('s1');
      const qb = mockQb(session);
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.findOne('s1', teacherA);

      expect(result).toBe(session);
    });

    it('throws NotFoundException when session is not found', async () => {
      const qb = mockQb(null);
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await expect(service.findOne('nope', teacherA)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('updates date when session has not been started', async () => {
      const session = stubSession('s1', { startTime: null });
      const qb = mockQb(session);
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      (sessionsRepository.save as jest.Mock).mockResolvedValue({
        ...session,
        date: '2026-01-20',
      } as ClassSession);

      const result = await service.update('s1', { date: '2026-01-20' }, teacherA);

      expect(result.date).toBe('2026-01-20');
    });

    it('throws BadRequestException when updating date on a started session', async () => {
      const session = stubSession('s1', { startTime: new Date() });
      const qb = mockQb(session);
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await expect(
        service.update('s1', { date: '2026-01-20' }, teacherA),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(sessionsRepository.save).not.toHaveBeenCalled();
    });

    it('updates notes without checking startTime', async () => {
      const session = stubSession('s1', { startTime: new Date() });
      const qb = mockQb(session);
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      (sessionsRepository.save as jest.Mock).mockResolvedValue({
        ...session,
        notes: 'Changed',
      } as ClassSession);

      const result = await service.update('s1', { notes: 'Changed' }, teacherA);

      expect(result.notes).toBe('Changed');
    });
  });

  // -------------------------------------------------------------------------
  // softDelete / restore
  // -------------------------------------------------------------------------

  describe('softDelete', () => {
    it('soft-removes the session when teacher-scoped', async () => {
      const session = stubSession('s1');
      const qb = mockQb(session);
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      (sessionsRepository.softRemove as jest.Mock).mockResolvedValue(session);

      await service.softDelete('s1', teacherA);

      expect(sessionsRepository.softRemove).toHaveBeenCalledWith(session);
    });
  });

  describe('restore', () => {
    it('restores a soft-deleted session when teacher-scoped', async () => {
      const deletedSession = stubSession('s1', { deletedAt: new Date() });
      const qb = mockQb(deletedSession);
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      (sessionsRepository.restore as jest.Mock).mockResolvedValue(undefined);

      await service.restore('s1', teacherA);

      expect(sessionsRepository.restore).toHaveBeenCalledWith('s1');
    });

    it('throws NotFoundException when session is not deleted (already active)', async () => {
      const activeSession = stubSession('s1', { deletedAt: null });
      const qb = mockQb(activeSession);
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await expect(service.restore('s1', teacherA)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException when session not found (cross-teacher)', async () => {
      const qb = mockQb(null);
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await expect(
        service.restore('nope', teacherA),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // start / end lifecycle
  // -------------------------------------------------------------------------

  describe('start', () => {
    it('sets startTime when session has not been started yet', async () => {
      const session = stubSession('s1', { startTime: null });
      const qb = mockQb(session);
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      (sessionsRepository.save as jest.Mock).mockImplementation(async (s) => s);

      const result = await service.start('s1', teacherA);

      expect(result.startTime).toBeInstanceOf(Date);
    });

    it('throws ConflictException when session is already started', async () => {
      const session = stubSession('s1', { startTime: new Date() });
      const qb = mockQb(session);
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await expect(service.start('s1', teacherA)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(sessionsRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('end', () => {
    it('sets endTime when session is started but not yet ended', async () => {
      const session = stubSession('s1', {
        startTime: new Date(),
        endTime: null,
      });
      const qb = mockQb(session);
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      (sessionsRepository.save as jest.Mock).mockImplementation(async (s) => s);

      const result = await service.end('s1', teacherA);

      expect(result.endTime).toBeInstanceOf(Date);
    });

    it('throws BadRequestException when session has not been started', async () => {
      const session = stubSession('s1', { startTime: null, endTime: null });
      const qb = mockQb(session);
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await expect(service.end('s1', teacherA)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(sessionsRepository.save).not.toHaveBeenCalled();
    });

    it('throws ConflictException when session has already ended', async () => {
      const session = stubSession('s1', {
        startTime: new Date(),
        endTime: new Date(),
      });
      const qb = mockQb(session);
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await expect(service.end('s1', teacherA)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(sessionsRepository.save).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // findByTeacher / findAll
  // -------------------------------------------------------------------------

  describe('findByTeacher', () => {
    it('delegates to findAll', async () => {
      const sessions = [stubSession('s1')];
      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(sessions),
      };
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.findByTeacher(teacherA);

      expect(result).toBe(sessions);
    });
  });

  // -------------------------------------------------------------------------
  // findByClass
  // -------------------------------------------------------------------------

  describe('findByClass', () => {
    it('validates class ownership then returns sessions', async () => {
      const sessions = [stubSession('s1')];
      (classesService.findOne as jest.Mock).mockResolvedValue({ id: 'cls1' });
      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(sessions),
      };
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.findByClass('cls1', teacherA);

      expect(classesService.findOne).toHaveBeenCalledWith('cls1', teacherA);
      expect(result).toBe(sessions);
    });

    it('throws NotFoundException when class is cross-teacher', async () => {
      (classesService.findOne as jest.Mock).mockRejectedValue(
        new NotFoundException('Class not found'),
      );

      await expect(
        service.findByClass('cls1', teacherA),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // findByDateRange
  // -------------------------------------------------------------------------

  describe('findByDateRange', () => {
    it('returns sessions whose date falls in the given range', async () => {
      const sessions = [stubSession('s1')];
      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(sessions),
      };
      (sessionsRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await service.findByDateRange(
        '2026-01-01',
        '2026-01-31',
        teacherA,
      );

      expect(result).toBe(sessions);
    });
  });
});
