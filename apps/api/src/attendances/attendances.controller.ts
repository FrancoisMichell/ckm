import {
  Body,
  Controller,
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
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRoleType } from '@ckm/contracts';
import { CurrentUser, Roles } from '@/common/decorators';
import { AuthenticatedUser } from '@/common/interfaces';
import { AttendancesService } from './attendances.service';
import { Attendance } from './attendance.entity';
import {
  BulkCreateAttendanceDto,
  CreateAttendanceDto,
  QueryAttendancesDto,
  UpdateAttendanceNotesDto,
} from './dto';

/**
 * Attendances HTTP surface.
 *
 * `@Roles(TEACHER)` at the class level guards every route — per-method
 * decorators are forbidden. Cross-teacher access is handled inside
 * {@link AttendancesService} and always returns 404 (never 403).
 *
 * Route ordering: specific path segments (`/bulk`) are declared BEFORE
 * the parametric `/:id` routes to ensure NestJS matches them first.
 */
@ApiTags('attendances')
@ApiBearerAuth('bearer')
@Controller('attendances')
@Roles(UserRoleType.TEACHER)
export class AttendancesController {
  constructor(private readonly attendancesService: AttendancesService) {}

  // ---------------------------------------------------------------------------
  // Create endpoints — /bulk must come before /:id routes
  // ---------------------------------------------------------------------------

  /**
   * POST /attendances/bulk
   * Idempotent bulk-create pending attendance rows for ALL enrolled students
   * in the given session's class.
   */
  @Post('bulk')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Bulk-create pending attendance rows for all enrolled students (idempotent)',
  })
  @ApiCreatedResponse({
    description: 'Array of attendance rows (existing + newly created)',
    type: [Attendance],
  })
  @ApiNotFoundResponse({ description: 'Session not found or cross-teacher' })
  createBulk(
    @Body() dto: BulkCreateAttendanceDto,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<Attendance[]> {
    return this.attendancesService.createBulk(dto.sessionId, teacher.id);
  }

  /**
   * POST /attendances
   * Idempotent single-create for a (session, student) pair.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a single attendance record (idempotent)',
  })
  @ApiCreatedResponse({
    description: 'Attendance record (existing or newly created)',
    type: Attendance,
  })
  @ApiNotFoundResponse({ description: 'Session not found or cross-teacher' })
  create(
    @Body() dto: CreateAttendanceDto,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<Attendance> {
    return this.attendancesService.create(dto, teacher.id);
  }

  // ---------------------------------------------------------------------------
  // List and single-fetch
  // ---------------------------------------------------------------------------

  /**
   * GET /attendances
   * List attendances for the teacher with optional filters.
   */
  @Get()
  @ApiOperation({
    summary: 'List attendances (teacher-scoped) with optional filters',
  })
  @ApiOkResponse({ description: 'Array of attendance records', type: [Attendance] })
  findAll(
    @Query() query: QueryAttendancesDto,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<Attendance[]> {
    return this.attendancesService.findAll(query, teacher.id);
  }

  /**
   * GET /attendances/:id
   * Fetch a single attendance record (404 if cross-teacher or missing).
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get one attendance record (404 if cross-teacher or missing)' })
  @ApiOkResponse({ description: 'Attendance record', type: Attendance })
  @ApiNotFoundResponse({ description: 'Not found or cross-teacher' })
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<Attendance> {
    return this.attendancesService.findOne(id, teacher.id);
  }

  // ---------------------------------------------------------------------------
  // Status shortcuts — /:id/present | /late | /absent | /excused
  // ---------------------------------------------------------------------------

  @Patch(':id/present')
  @ApiOperation({ summary: 'Mark attendance as PRESENT (sets checkedInAt = now)' })
  @ApiOkResponse({ description: 'Updated attendance record', type: Attendance })
  @ApiNotFoundResponse({ description: 'Not found or cross-teacher' })
  markPresent(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<Attendance> {
    return this.attendancesService.markPresent(id, teacher.id);
  }

  @Patch(':id/late')
  @ApiOperation({ summary: 'Mark attendance as LATE (sets checkedInAt = now)' })
  @ApiOkResponse({ description: 'Updated attendance record', type: Attendance })
  @ApiNotFoundResponse({ description: 'Not found or cross-teacher' })
  markLate(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<Attendance> {
    return this.attendancesService.markLate(id, teacher.id);
  }

  @Patch(':id/absent')
  @ApiOperation({ summary: 'Mark attendance as ABSENT (clears checkedInAt)' })
  @ApiOkResponse({ description: 'Updated attendance record', type: Attendance })
  @ApiNotFoundResponse({ description: 'Not found or cross-teacher' })
  markAbsent(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<Attendance> {
    return this.attendancesService.markAbsent(id, teacher.id);
  }

  @Patch(':id/excused')
  @ApiOperation({ summary: 'Mark attendance as EXCUSED (clears checkedInAt)' })
  @ApiOkResponse({ description: 'Updated attendance record', type: Attendance })
  @ApiNotFoundResponse({ description: 'Not found or cross-teacher' })
  markExcused(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<Attendance> {
    return this.attendancesService.markExcused(id, teacher.id);
  }

  // ---------------------------------------------------------------------------
  // Notes update
  // ---------------------------------------------------------------------------

  @Patch(':id/notes')
  @ApiOperation({ summary: 'Update notes on an attendance record' })
  @ApiOkResponse({ description: 'Updated attendance record', type: Attendance })
  @ApiNotFoundResponse({ description: 'Not found or cross-teacher' })
  updateNotes(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateAttendanceNotesDto,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<Attendance> {
    return this.attendancesService.updateNotes(id, dto, teacher.id);
  }
}
