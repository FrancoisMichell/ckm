import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Belt } from '@ckm/contracts';

/**
 * Accepted string values for the day-of-week column (TEXT[]).
 * Mirrors the `day_of_week_enum` Postgres type defined in migration 5.
 */
export enum DayOfWeekValue {
  SUNDAY = 'sunday',
  MONDAY = 'monday',
  TUESDAY = 'tuesday',
  WEDNESDAY = 'wednesday',
  THURSDAY = 'thursday',
  FRIDAY = 'friday',
  SATURDAY = 'saturday',
}

export class CreateClassDto {
  @ApiProperty({ description: 'Class name', example: 'Turma Iniciante Manhã' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  declare name: string;

  @ApiProperty({
    description: 'Days of the week the class runs',
    enum: DayOfWeekValue,
    isArray: true,
    example: ['monday', 'wednesday', 'friday'],
  })
  @IsArray()
  @IsEnum(DayOfWeekValue, { each: true })
  declare days: DayOfWeekValue[];

  @ApiProperty({
    description: 'Start time in HH:MM format',
    example: '07:30',
    pattern: '^\\d{2}:\\d{2}$',
  })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, {
    message: 'startTime must be in HH:MM format',
  })
  declare startTime: string;

  @ApiProperty({
    description: 'Duration in minutes (30–300)',
    minimum: 30,
    maximum: 300,
    example: 60,
  })
  @IsInt()
  @Min(30)
  @Max(300)
  declare durationMinutes: number;

  @ApiProperty({
    description: 'Minimum belt rank for the class',
    enum: Belt,
    example: Belt.WHITE,
  })
  @IsEnum(Belt)
  declare belt: Belt;
}
