import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAttendanceDto {
  @ApiProperty({ format: 'uuid', description: 'ID of the class session' })
  @IsUUID('4')
  declare sessionId: string;

  @ApiProperty({ format: 'uuid', description: 'ID of the student' })
  @IsUUID('4')
  declare studentId: string;

  @ApiPropertyOptional({ description: 'Optional notes (max 500 chars)', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  declare notes?: string;
}
