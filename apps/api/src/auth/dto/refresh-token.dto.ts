import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/**
 * Body shape for POST /auth/refresh and POST /auth/logout.
 *
 * `refresh_token` is the opaque base64url string returned by /auth/login —
 * never a JWT. The service hashes it (SHA-256 for lookup, bcrypt for storage
 * comparison) before any DB work.
 *
 * Snake_case property name matches the on-the-wire shape used by /auth/login's
 * response body, so a client can echo back the same field without renaming.
 */
export class RefreshTokenDto {
  @ApiProperty({
    description:
      'Opaque base64url refresh token issued by /auth/login (never a JWT).',
  })
  @IsString()
  @MinLength(1)
  declare refresh_token: string;
}
