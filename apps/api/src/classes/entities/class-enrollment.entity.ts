import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '@/users/entities/user.entity';
import { Class } from './class.entity';

/**
 * Join table linking a student (User with STUDENT role) to a Class.
 *
 * Supports soft-delete so enrollment history is preserved and a
 * previously-unenrolled student can be re-enrolled (restore pattern).
 *
 * The partial unique index `uq_class_enrollments_active` (WHERE
 * deleted_at IS NULL) enforces the deduplication invariant at DB level:
 *   - Inserting a duplicate active enrollment → 23505 (handled by
 *     ClassesService.enroll which detects and restores soft-deleted rows).
 *   - Two soft-deleted rows for the same (class, student) pair are allowed.
 */
@Entity('class_enrollments')
export class ClassEnrollment {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @ManyToOne(() => Class, (c) => c.enrollments, {
    nullable: false,
    eager: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'class_id' })
  declare class: Class;

  @Column({ name: 'class_id' })
  declare classId: string;

  @ManyToOne(() => User, { nullable: false, eager: false })
  @JoinColumn({ name: 'user_id' })
  declare student: User;

  @Column({ name: 'user_id' })
  declare userId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  declare createdAt: Date;

  @Exclude()
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  declare deletedAt: Date | null;
}
