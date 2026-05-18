import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/**
 * Body shape for POST /auth/login.
 *
 * The login identifier is the academy `registry` number (PT-BR "Registro"),
 * not an email. LocalStrategy's `usernameField: 'registry'` reads this field
 * directly from the request body — keep the name in sync.
 *
 * No max length here: bcrypt truncates at 72 bytes and the registry is short.
 * `MinLength(1)` is the smallest meaningful guard; class-validator's whitelist
 * mode strips any extra fields before this DTO is validated.
 */
export class LoginDto {
  @ApiProperty({
    description: 'Academy registry number (PT-BR "Registro").',
    example: '0001',
  })
  @IsString()
  @MinLength(1)
  declare registry: string;

  @ApiProperty({
    description: 'Plaintext password (bcrypt-compared server-side).',
    example: 'correct-horse-battery-staple',
  })
  @IsString()
  @MinLength(1)
  declare password: string;
}
