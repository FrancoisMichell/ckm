import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRoleType } from '@ckm/contracts';
import { CurrentUser, Roles } from '@/common/decorators';
import { AuthenticatedUser } from '@/common/interfaces';
import { ClassSessionsService } from './class-sessions.service';
import { ClassSession } from './class-session.entity';
import {
  CreateSessionDto,
  DateRangeQueryDto,
  UpdateSessionDto,
} from './dto';

/**
 * Class-sessions HTTP surface.
 *
 * `@Roles(TEACHER)` at the class level guards every route — per-method
 * decorators are forbidden. Cross-teacher access is handled inside
 * {@link ClassSessionsService} and always returns 404 (never 403).
 *
 * Route ordering note: specific path segments (`/by-class`, `/by-teacher`,
 * `/by-date-range`) are declared **before** the parametric `/:id` routes to
 * ensure NestJS matches them first.
 */
@ApiTags('class-sessions')
@ApiBearerAuth('bearer')
@Controller('class-sessions')
@Roles(UserRoleType.TEACHER)
export class ClassSessionsController {
  constructor(private readonly classSessionsService: ClassSessionsService) {}

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a session for a class owned by the teacher' })
  @ApiCreatedResponse({ description: 'Session created', type: ClassSession })
  @ApiConflictResponse({
    description: 'A session already exists for this class on this date',
  })
  @ApiNotFoundResponse({ description: 'Class not found or cross-teacher' })
  create(
    @Body() dto: CreateSessionDto,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<ClassSession> {
    return this.classSessionsService.create(dto, teacher.id);
  }

  // ---------------------------------------------------------------------------
  // Collection reads — declared before /:id to avoid route collision
  // ---------------------------------------------------------------------------

  @Get('by-class/:classId')
  @ApiOperation({ summary: 'List sessions for a specific class (teacher-scoped)' })
  @ApiOkResponse({ description: 'Array of sessions', type: [ClassSession] })
  @ApiNotFoundResponse({ description: 'Class not found or cross-teacher' })
  findByClass(
    @Param('classId', new ParseUUIDPipe({ version: '4' })) classId: string,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<ClassSession[]> {
    return this.classSessionsService.findByClass(classId, teacher.id);
  }

  @Get('by-teacher')
  @ApiOperation({ summary: 'List all sessions owned by the calling teacher' })
  @ApiOkResponse({ description: 'Array of sessions', type: [ClassSession] })
  findByTeacher(
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<ClassSession[]> {
    return this.classSessionsService.findByTeacher(teacher.id);
  }

  @Get('by-date-range')
  @ApiOperation({
    summary: 'List sessions within an inclusive date range (teacher-scoped)',
  })
  @ApiOkResponse({ description: 'Array of sessions', type: [ClassSession] })
  findByDateRange(
    @Query() query: DateRangeQueryDto,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<ClassSession[]> {
    return this.classSessionsService.findByDateRange(
      query.from,
      query.to,
      teacher.id,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all sessions owned by the calling teacher' })
  @ApiOkResponse({ description: 'Array of sessions', type: [ClassSession] })
  findAll(@CurrentUser() teacher: AuthenticatedUser): Promise<ClassSession[]> {
    return this.classSessionsService.findAll(teacher.id);
  }

  // ---------------------------------------------------------------------------
  // Single-session reads and mutations
  // ---------------------------------------------------------------------------

  @Get(':id')
  @ApiOperation({ summary: 'Get one session (404 if cross-teacher or missing)' })
  @ApiOkResponse({ description: 'Session', type: ClassSession })
  @ApiNotFoundResponse({ description: 'Not found or cross-teacher' })
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<ClassSession> {
    return this.classSessionsService.findOne(id, teacher.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Patch a session date/notes (404 if cross-teacher)' })
  @ApiOkResponse({ description: 'Updated session', type: ClassSession })
  @ApiNotFoundResponse({ description: 'Not found or cross-teacher' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateSessionDto,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<ClassSession> {
    return this.classSessionsService.update(id, dto, teacher.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a session (404 if cross-teacher)' })
  @ApiNoContentResponse({ description: 'Session soft-deleted' })
  @ApiNotFoundResponse({ description: 'Not found or cross-teacher' })
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<void> {
    return this.classSessionsService.softDelete(id, teacher.id);
  }

  @Patch(':id/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Restore a soft-deleted session' })
  @ApiNoContentResponse({ description: 'Session restored' })
  @ApiNotFoundResponse({ description: 'Not found or cross-teacher' })
  restore(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<void> {
    return this.classSessionsService.restore(id, teacher.id);
  }

  @Patch(':id/start')
  @ApiOperation({
    summary: 'Start a session (sets startTime = now); 409 if already started',
  })
  @ApiOkResponse({ description: 'Session started', type: ClassSession })
  @ApiConflictResponse({ description: 'Session already started' })
  @ApiNotFoundResponse({ description: 'Not found or cross-teacher' })
  start(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<ClassSession> {
    return this.classSessionsService.start(id, teacher.id);
  }

  @Patch(':id/end')
  @ApiOperation({
    summary:
      'End a session (sets endTime = now); 400 if not started; 409 if already ended',
  })
  @ApiOkResponse({ description: 'Session ended', type: ClassSession })
  @ApiConflictResponse({ description: 'Session already ended' })
  @ApiNotFoundResponse({ description: 'Not found or cross-teacher' })
  end(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<ClassSession> {
    return this.classSessionsService.end(id, teacher.id);
  }
}
