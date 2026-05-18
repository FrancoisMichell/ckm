import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { User } from '../../users/entities/user.entity';

/**
 * Persistent record of an issued refresh token.
 *
 * Security model:
 * - token_hash: bcrypt hash of the opaque raw token. Never store plaintext.
 * - lookup_hash: SHA-256 hex of the raw token for O(1) row lookup without
 *   scanning bcrypt hashes (which would require comparing every row).
 * - family_id: groups all tokens produced through successive rotations.
 *   On replay detection (revoked token presented again), every row sharing
 *   family_id is revoked to neutralise the compromised family.
 * - replaced_by: id of the successor row created during rotation. NULL until consumed.
 * - revoked: true once consumed (rotated), logged out, or family-revoked.
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  declare userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  declare user: User;

  @Exclude()
  @Column({ name: 'token_hash', type: 'text' })
  declare tokenHash: string;

  @Exclude()
  @Column({ name: 'lookup_hash', type: 'text' })
  declare lookupHash: string;

  @Column({ name: 'family_id', type: 'uuid' })
  declare familyId: string;

  @Column({ name: 'replaced_by', type: 'uuid', nullable: true })
  declare replacedBy: string | null;

  @Column({ name: 'revoked', type: 'boolean', default: false })
  declare revoked: boolean;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  declare expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  declare createdAt: Date;
}
