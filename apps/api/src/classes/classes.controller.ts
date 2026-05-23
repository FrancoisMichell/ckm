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
import { Roles, CurrentUser } from '@/common/decorators';
import { AuthenticatedUser } from '@/common/interfaces';
import { ClassesService } from './classes.service';
import { CreateClassDto, UpdateClassDto, EnrollDto } from './dto';
import { Class } from './entities/class.entity';
import { ClassEnrollment } from './entities/class-enrollment.entity';

/**
 * Classes HTTP surface.
 *
 * `@Roles(TEACHER)` at the class level guards every route — per-method
 * decorators are forbidden (see `docs/api/04-auth-and-rbac.md`).
 * Cross-teacher access is handled inside {@link ClassesService} and
 * always returns 404 (never 403).
 */
@ApiTags('classes')
@ApiBearerAuth('bearer')
@Controller('classes')
@Roles(UserRoleType.TEACHER)
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  // ---------------------------------------------------------------------------
  // Class CRUD
  // ---------------------------------------------------------------------------

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a class under the calling teacher' })
  @ApiCreatedResponse({ description: 'Class created', type: Class })
  create(
    @Body() dto: CreateClassDto,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<Class> {
    return this.classesService.create(dto, teacher.id);
  }

  @Get()
  @ApiOperation({ summary: 'List all classes owned by the calling teacher' })
  @ApiOkResponse({ description: 'Array of classes', type: [Class] })
  findAll(@CurrentUser() teacher: AuthenticatedUser): Promise<Class[]> {
    return this.classesService.findAll(teacher.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one class (404 if cross-teacher or missing)' })
  @ApiOkResponse({ description: 'Class', type: Class })
  @ApiNotFoundResponse({ description: 'Not found or cross-teacher' })
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<Class> {
    return this.classesService.findOne(id, teacher.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Patch a class (404 if cross-teacher)' })
  @ApiOkResponse({ description: 'Updated class', type: Class })
  @ApiNotFoundResponse({ description: 'Not found or cross-teacher' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateClassDto,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<Class> {
    return this.classesService.update(id, dto, teacher.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a class (404 if cross-teacher)' })
  @ApiNoContentResponse({ description: 'Class soft-deleted' })
  @ApiNotFoundResponse({ description: 'Not found or cross-teacher' })
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<void> {
    return this.classesService.softDelete(id, teacher.id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Restore a soft-deleted class' })
  @ApiNoContentResponse({ description: 'Class restored' })
  @ApiNotFoundResponse({ description: 'Not found or cross-teacher' })
  restore(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<void> {
    return this.classesService.restore(id, teacher.id);
  }

  // ---------------------------------------------------------------------------
  // Enrollment management
  // ---------------------------------------------------------------------------

  @Post(':id/enrollments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Enroll a student in a class (restores soft-deleted if exists)',
  })
  @ApiCreatedResponse({ description: 'Enrollment created or restored' })
  @ApiConflictResponse({ description: 'Student already actively enrolled' })
  @ApiNotFoundResponse({ description: 'Class or student not found' })
  enroll(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: EnrollDto,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<ClassEnrollment> {
    return this.classesService.enroll(id, dto.studentId, teacher.id);
  }

  @Delete(':id/enrollments/:studentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete (unenroll) a student from a class' })
  @ApiNoContentResponse({ description: 'Enrollment soft-deleted' })
  @ApiNotFoundResponse({ description: 'Enrollment not found' })
  unenroll(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('studentId', new ParseUUIDPipe({ version: '4' })) studentId: string,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<void> {
    return this.classesService.unenroll(id, studentId, teacher.id);
  }

  @Get(':id/enrollments')
  @ApiOperation({ summary: 'List enrolled students for a class' })
  @ApiOkResponse({ description: 'Array of active enrollments' })
  @ApiNotFoundResponse({ description: 'Class not found or cross-teacher' })
  findEnrollments(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<ClassEnrollment[]> {
    return this.classesService.findEnrollments(id, teacher.id);
  }
}
