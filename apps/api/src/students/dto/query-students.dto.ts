import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Belt } from '@ckm/contracts';

/**
 * Query string for GET /students.
 *
 * Standalone DTO (not a `QueryUsersDto` subclass) so the Swagger emit lists
 * every parameter directly on the students endpoint. The shape mirrors
 * `QueryUsersDto` for `UsersService.findByRole` compatibility, with the
 * student-only `notEnrolledInClass` / `notInSession` filters surfaced
 * here as first-class fields.
 */
export class QueryStudentsDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Page size',
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Filter by name (case-insensitive partial match)',
    example: 'João',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    description: 'Filter by registry (case-insensitive partial match)',
    example: 'S2024',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  registry?: string;

  @ApiPropertyOptional({
    description: 'Filter by one or more belt ranks. Repeat the param to pass multiple.',
    enum: Belt,
    isArray: true,
    example: [Belt.WHITE, Belt.BLUE],
  })
  @IsOptional()
  // Coerce a single ?belts=white into [Belt.WHITE] so the `each: true`
  // validator below sees the expected array shape regardless of arity.
  @Transform(
    ({ value }): Belt[] | undefined => {
      if (value === undefined || value === null) return undefined;
      if (Array.isArray(value)) return value as Belt[];
      return [value as Belt];
    },
    { toClassOnly: true },
  )
  @IsEnum(Belt, { each: true })
  belts?: Belt[];

  @ApiPropertyOptional({
    description:
      'Exclude students currently enrolled in this class id (UUID v4)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID('4', { message: 'notEnrolledInClass must be a valid UUID v4' })
  notEnrolledInClass?: string;

  @ApiPropertyOptional({
    description:
      'Exclude students who already have attendance on this session id (UUID v4)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID('4', { message: 'notInSession must be a valid UUID v4' })
  notInSession?: string;

  @ApiPropertyOptional({
    description: 'Sort key',
    enum: ['name', 'belt', 'createdAt'],
    default: 'name',
  })
  @IsOptional()
  @IsIn(['name', 'belt', 'createdAt'])
  sortBy?: 'name' | 'belt' | 'createdAt' = 'name';

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['ASC', 'DESC'],
    default: 'ASC',
  })
  @IsOptional()
  @Transform(
    ({ value }): string | undefined =>
      typeof value === 'string' ? value.toUpperCase() : undefined,
    { toClassOnly: true },
  )
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'ASC';
}
