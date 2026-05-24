import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateSessionDto } from './create-session.dto';

/**
 * Payload for `PATCH /class-sessions/:id`.
 *
 * All fields from {@link CreateSessionDto} are optional except `classId`
 * which is omitted — a session cannot be moved to a different class after
 * creation (ownership is fixed at create time).
 */
export class UpdateSessionDto extends PartialType(
  OmitType(CreateSessionDto, ['classId'] as const),
) {}
