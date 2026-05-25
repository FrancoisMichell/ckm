import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class BulkCreateAttendanceDto {
  @ApiProperty({ format: 'uuid', description: 'ID of the class session' })
  @IsUUID('4')
  declare sessionId: string;
}
