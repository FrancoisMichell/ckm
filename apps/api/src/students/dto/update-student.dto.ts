import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateStudentDto } from './create-student.dto';

/**
 * Payload for PATCH /students/:id.
 *
 * All fields from `CreateStudentDto` are optional. Password change is
 * intentionally excluded — it goes through a dedicated flow when the
 * student-portal feature lands. There is no `isActive` field: lifecycle is
 * managed by DELETE (soft) / POST :id/restore (M9 hardens these).
 */
export class UpdateStudentDto extends PartialType(
  OmitType(CreateStudentDto, ['password'] as const),
) {}
