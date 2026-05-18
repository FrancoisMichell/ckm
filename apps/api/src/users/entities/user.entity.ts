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
import { UserRole } from './user-role.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'varchar' })
  declare name: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  declare registry: string | null;

  @Exclude()
  @Column({ type: 'varchar', nullable: true })
  declare password: string | null;

  @Column({ type: 'enum', enum: Belt, default: Belt.WHITE })
  declare belt: Belt;

  @Column({ name: 'birthday', type: 'date', nullable: true })
  declare birthday: Date | null;

  @Column({ name: 'training_since', type: 'date', nullable: true })
  declare trainingSince: Date | null;

  @ManyToOne(() => User, (u) => u.students, { nullable: true })
  @JoinColumn({ name: 'instructor_id' })
  declare instructor: User | null;

  @OneToMany(() => User, (u) => u.instructor)
  declare students: User[];

  @OneToMany(() => UserRole, (r) => r.user, { cascade: true })
  declare roles: UserRole[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  declare createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  declare updatedAt: Date;

  @Exclude()
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  declare deletedAt: Date | null;
}
