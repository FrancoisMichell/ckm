import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Payload for `POST /class-sessions`.
 *
 * `classId` must reference a class owned by the calling teacher.
 * `date` is an ISO-8601 date string (`YYYY-MM-DD`).
 * `notes` is optional free-text (max 500 chars).
 */
export class CreateSessionDto {
  @ApiProperty({
    description: 'UUID of the class this session belongs to',
    format: 'uuid',
  })
  @IsUUID('4')
  @IsNotEmpty()
  declare classId: string;

  @ApiProperty({
    description: 'Calendar date of the session (YYYY-MM-DD)',
    example: '2025-06-03',
    format: 'date',
  })
  @IsDateString()
  declare date: string;

  @ApiPropertyOptional({
    description: 'Optional session notes (max 500 chars)',
    example: 'Focus on guard passing',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  declare notes?: string;
}
