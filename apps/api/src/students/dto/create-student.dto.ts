import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Belt } from '@ckm/contracts';

/**
 * Payload for POST /students.
 *
 * The `instructor` relation is **not** accepted here — the controller binds it
 * from `currentUser.id` so a client cannot create a student under another
 * teacher's tenant by forging an instructorId.
 */
export class CreateStudentDto {
  @ApiProperty({ description: 'Full name', example: 'João da Silva' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  declare name: string;

  @ApiPropertyOptional({
    description: 'Registry number (login identifier). Unique among non-deleted users.',
    example: 'S2024001',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  registry?: string;

  @ApiProperty({
    description: 'Belt rank',
    enum: Belt,
    example: Belt.WHITE,
  })
  @IsEnum(Belt)
  declare belt: Belt;

  @ApiPropertyOptional({
    description: 'Date of birth (ISO 8601 date)',
    example: '2000-01-01',
    type: String,
    format: 'date',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthday?: Date;

  @ApiPropertyOptional({
    description: 'Date the student started training (ISO 8601 date)',
    example: '2015-06-01',
    type: String,
    format: 'date',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  trainingSince?: Date;

  /**
   * Optional initial password. Required only if the student will log in
   * (v1 student portal is out of scope). Stored bcrypt-hashed by
   * UsersService.create.
   */
  @ApiPropertyOptional({
    description: 'Plaintext password (bcrypt-hashed before storage)',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  @Type(() => String)
  password?: string;
}
