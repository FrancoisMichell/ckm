import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { AttendanceStatus } from '@ckm/contracts';

export class QueryAttendancesDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by session ID' })
  @IsOptional()
  @IsUUID('4')
  declare sessionId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by student ID' })
  @IsOptional()
  @IsUUID('4')
  declare studentId?: string;

  @ApiPropertyOptional({
    enum: AttendanceStatus,
    description: 'Filter by attendance status',
  })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  declare status?: AttendanceStatus;
}
