import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAttendanceNotesDto {
  /**
   * Pass `null` to clear notes. Pass a string to set/overwrite notes.
   * Omitting the field entirely is also valid (no-op — not recommended but safe).
   */
  @ApiPropertyOptional({
    description: 'Notes text (max 500 chars). Pass null to clear.',
    maxLength: 500,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  declare notes?: string | null;
}
