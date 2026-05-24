import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Class } from '@/classes/entities/class.entity';

/**
 * Represents a dated occurrence of a recurring class (a "session").
 *
 * Multi-tenancy: ownership is derived through `class.teacherId`.
 * All service queries must validate class ownership before touching sessions.
 *
 * `date` is stored as a Postgres DATE column and read back as a `YYYY-MM-DD`
 * string (TypeORM maps DATE → string when the JS type is string).
 *
 * `startTime` and `endTime` are nullable timestamptz columns populated by the
 * start/end lifecycle methods. They are set once and never reset.
 *
 * Partial unique index `uq_class_sessions_class_date_active` on (class_id, date)
 * WHERE deleted_at IS NULL prevents duplicate active sessions for the same
 * class+date while allowing restore after a soft-delete.
 */
@Entity('class_sessions')
export class ClassSession {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  /**
   * FK to the owning class. Named constraint: `fk_class_sessions_class`.
   */
  @ManyToOne(() => Class, { nullable: false, eager: false })
  @JoinColumn({ name: 'class_id' })
  declare class: Class;

  @Column({ name: 'class_id' })
  declare classId: string;

  /**
   * Calendar date of the session (YYYY-MM-DD).
   * Stored as Postgres DATE; TypeORM returns it as a string.
   */
  @Column({ type: 'date' })
  declare date: string;

  /**
   * Wall-clock time when the teacher started the session.
   * Null until `PATCH /class-sessions/:id/start` is called.
   */
  @Column({ name: 'start_time', type: 'timestamptz', nullable: true })
  declare startTime: Date | null;

  /**
   * Wall-clock time when the teacher ended the session.
   * Null until `PATCH /class-sessions/:id/end` is called.
   */
  @Column({ name: 'end_time', type: 'timestamptz', nullable: true })
  declare endTime: Date | null;

  /**
   * Optional free-text notes about the session (max 500 chars).
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  declare notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  declare createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  declare updatedAt: Date;

  @Exclude()
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  declare deletedAt: Date | null;
}
