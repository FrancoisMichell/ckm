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
import { User } from '@/users/entities/user.entity';
import { StudentsService } from './students.service';
import {
  CreateStudentDto,
  QueryStudentsDto,
  UpdateStudentDto,
} from './dto';

/**
 * Students HTTP surface.
 *
 * `@Roles(TEACHER)` is bound at the class level so every method requires
 * the TEACHER role; this is the release-blocking rule from
 * `docs/api/04-auth-and-rbac.md`. Per-method `@Roles(...)` decorators are
 * prohibited — they make it too easy to introduce a method-level gap.
 *
 * `@CurrentUser()` populates `teacher` from the JWT payload (id, registry,
 * roles only — never the full entity). Every handler forwards `teacher.id`
 * to the service so tenant scoping is centralised there.
 */
@ApiTags('students')
@ApiBearerAuth('bearer')
@Controller('students')
@Roles(UserRoleType.TEACHER)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a student under the calling teacher' })
  @ApiCreatedResponse({ description: 'Student created', type: User })
  create(
    @Body() dto: CreateStudentDto,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<User | null> {
    return this.studentsService.create(dto, teacher.id);
  }

  @Get()
  @ApiOperation({
    summary:
      'List students owned by the calling teacher, with filters and pagination',
  })
  @ApiOkResponse({ description: 'Paginated list of students' })
  findAll(
    @Query() query: QueryStudentsDto,
    @CurrentUser() teacher: AuthenticatedUser,
  ) {
    return this.studentsService.findAll(query, teacher.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one student by id (404 if cross-teacher)' })
  @ApiOkResponse({ description: 'Student', type: User })
  @ApiNotFoundResponse({ description: 'Not found or owned by another teacher' })
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<User> {
    return this.studentsService.findOne(id, teacher.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Patch a student (404 if cross-teacher)' })
  @ApiOkResponse({ description: 'Updated student', type: User })
  @ApiNotFoundResponse({ description: 'Not found or owned by another teacher' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<User | null> {
    return this.studentsService.update(id, dto, teacher.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a student (404 if cross-teacher)' })
  @ApiNoContentResponse({ description: 'Student soft-deleted' })
  @ApiNotFoundResponse({ description: 'Not found or owned by another teacher' })
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<void> {
    return this.studentsService.softDelete(id, teacher.id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Restore a soft-deleted student' })
  @ApiNoContentResponse({ description: 'Student restored' })
  @ApiNotFoundResponse({ description: 'Not found or owned by another teacher' })
  restore(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() teacher: AuthenticatedUser,
  ): Promise<void> {
    return this.studentsService.restore(id, teacher.id);
  }
}
