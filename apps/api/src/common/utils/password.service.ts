import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Hash a plaintext password using bcrypt.
   * Salt rounds come from security.bcryptSaltRounds config key.
   */
  hashPassword(password: string): Promise<string> {
    const rounds = this.config.getOrThrow<number>('security.bcryptSaltRounds');
    return bcrypt.hash(password, rounds);
  }

  /**
   * Compare a plaintext password against a bcrypt hash.
   * Returns true if they match.
   */
  compare(plaintext: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plaintext, hash);
  }
}
