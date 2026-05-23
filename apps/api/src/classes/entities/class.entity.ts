import { Belt } from '@ckm/contracts';
import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '@/users/entities/user.entity';
import { ClassEnrollment } from './class-enrollment.entity';

/**
 * Represents a recurring class in the weekly schedule.
 *
 * Multi-tenancy: every Class row is owned by exactly one teacher
 * (`teacher_id`). All service queries must filter by teacher id.
 *
 * `days` stores an array of {@link DayOfWeek} values as a TEXT[]
 * column (Postgres array). `start_time` is a HH:MM string; duration
 * is stored in minutes rather than as an interval so arithmetic stays
 * simple on both the server and client.
 */
@Entity('classes')
export class Class {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'varchar', length: 120 })
  declare name: string;

  /**
   * Days of the week the class runs (0–6, stored as TEXT[]).
   * Postgres `simple-array` would join into a single string; using
   * `array` type keeps the column as a native Postgres TEXT[] that
   * TypeORM reads back as string[].
   */
  @Column({
    type: 'text',
    array: true,
    nullable: false,
    default: '{}',
  })
  declare days: string[];

  /**
   * Start time in HH:MM format (e.g. "07:30").
   */
  @Column({ name: 'start_time', type: 'varchar', length: 5 })
  declare startTime: string;

  /**
   * Duration in minutes. CHECK constraint (chk_classes_duration) enforces 30–300.
   */
  @Column({ name: 'duration_minutes', type: 'int' })
  declare durationMinutes: number;

  /**
   * Minimum belt rank required for this class.
   */
  @Column({ type: 'enum', enum: Belt, default: Belt.WHITE })
  declare belt: Belt;

  /**
   * Owning teacher. Foreign key `fk_classes_teacher_id`.
   */
  @ManyToOne(() => User, { nullable: false, eager: false })
  @JoinColumn({ name: 'teacher_id' })
  declare teacher: User;

  @Column({ name: 'teacher_id' })
  declare teacherId: string;

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'created_by_id' })
  declare createdBy: User | null;

  @Column({ name: 'created_by_id', nullable: true })
  declare createdById: string | null;

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'updated_by_id' })
  declare updatedBy: User | null;

  @Column({ name: 'updated_by_id', nullable: true })
  declare updatedById: string | null;

  @OneToMany(() => ClassEnrollment, (e) => e.class, { cascade: false })
  declare enrollments: ClassEnrollment[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  declare createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  declare updatedAt: Date;

  @Exclude()
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  declare deletedAt: Date | null;
}
