import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Payload for POST /classes/:id/enrollments.
 */
export class EnrollDto {
  @ApiProperty({
    description: 'UUID of the student to enroll',
    format: 'uuid',
  })
  @IsUUID('4')
  declare studentId: string;
}
