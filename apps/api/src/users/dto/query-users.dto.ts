import { Belt } from '@ckm/contracts';
import { Type } from 'class-transformer';
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

export class QueryUsersDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  registry?: string;

  @IsOptional()
  @IsEnum(Belt, { each: true })
  belts?: Belt[];

  @IsOptional()
  @IsUUID()
  notEnrolledInClass?: string;

  @IsOptional()
  @IsUUID()
  notInSession?: string;

  @IsOptional()
  @IsIn(['name', 'belt', 'createdAt'])
  sortBy?: 'name' | 'belt' | 'createdAt' = 'name';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'ASC';
}
