import { PartialType } from '@nestjs/swagger';
import { CreateClassDto } from './create-class.dto';

/**
 * All fields from {@link CreateClassDto} are optional for PATCH.
 */
export class UpdateClassDto extends PartialType(CreateClassDto) {}
