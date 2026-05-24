import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

/**
 * Query-string DTO for the `GET /class-sessions/by-date-range` endpoint.
 *
 * Both `from` and `to` are ISO-8601 date strings (`YYYY-MM-DD`).
 * The range is inclusive on both ends.
 */
export class DateRangeQueryDto {
  @ApiProperty({
    description: 'Start of date range (YYYY-MM-DD, inclusive)',
    example: '2025-06-01',
    format: 'date',
  })
  @IsDateString()
  declare from: string;

  @ApiProperty({
    description: 'End of date range (YYYY-MM-DD, inclusive)',
    example: '2025-06-30',
    format: 'date',
  })
  @IsDateString()
  declare to: string;
}
