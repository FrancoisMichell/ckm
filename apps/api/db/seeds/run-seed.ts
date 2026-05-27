/**
 * Dev/test seed runner.
 *
 * Seeds the development database idempotently with a minimal, consistent
 * data set useful for local development and smoke testing:
 *   - 1 teacher (registry: 0001)
 *   - 6 students (registry: 0002–0007)
 *   - 1 class  ("Fundamentos do BJJ")
 *   - 3 sessions (yesterday, today, tomorrow)
 *
 * SAFETY GUARD: refuses to run if NODE_ENV === 'production'.
 * Every seeder is idempotent — running the script twice does NOT
 * create duplicate rows (find-or-create pattern).
 *
 * Usage:
 *   pnpm --filter api seed:dev
 *   npm run seed:dev
 */

import * as path from 'path';
import { config } from 'dotenv';

// Load env vars before any import that reads process.env
config({
  path: path.resolve(__dirname, '../../.env'),
  override: false, // don't clobber already-set vars (e.g. in CI)
});

// ──────────────────────────────────────────────────────────────────────────────
// Safety guard — must be checked before any DB connection is opened.
// ──────────────────────────────────────────────────────────────────────────────
if (process.env['NODE_ENV'] === 'production') {
  console.error(
    '[seed] ERROR: Seed runner must not execute in production. '
      + 'Set NODE_ENV to "development" or "test".',
  );
  process.exit(1);
}

import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Belt, UserRoleType } from '@ckm/contracts';
import { datasourceOptions } from '../datasource';

// ──────────────────────────────────────────────────────────────────────────────
// Seed constants — change these to adjust the seeded credentials.
// ──────────────────────────────────────────────────────────────────────────────

/** Plain-text password for the seeded teacher account (registry `0001`). */
const SEED_TEACHER_PASSWORD = 'Admin@12345';

/** Bcrypt cost rounds used during seeding (low for speed; not used in prod). */
const SEED_BCRYPT_ROUNDS = 10;

// ──────────────────────────────────────────────────────────────────────────────
// Main seed function
// ──────────────────────────────────────────────────────────────────────────────
async function seed(): Promise<void> {
  const ds = new DataSource({
    ...datasourceOptions,
    // Force entity/migration paths to resolve from the compiled dist.
    // When running via ts-node the entity patterns point to .ts sources.
    entities: ['src/**/*.entity.ts', 'dist/**/*.entity.js'],
    migrations: [],
    synchronize: false,
    logging: false,
  });

  await ds.initialize();

  console.log('[seed] Connected to database:', process.env['DB_NAME']);

  try {
    const passwordHash = await bcrypt.hash(
      SEED_TEACHER_PASSWORD,
      SEED_BCRYPT_ROUNDS,
    );

    await ds.transaction(async (em) => {
      // ──────────────────────────────────────────────────────────────────────
      // 1. Teacher
      // ──────────────────────────────────────────────────────────────────────
      let teacher = await em.query<{ id: string }[]>(
        `SELECT id FROM users WHERE registry = $1 AND deleted_at IS NULL LIMIT 1`,
        ['0001'],
      );

      let teacherId: string;
      if (teacher.length === 0) {
        const inserted = await em.query<{ id: string }[]>(
          `INSERT INTO users (id, name, registry, password, belt, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), now())
           RETURNING id`,
          ['Mestre Admin', '0001', passwordHash, Belt.BLACK],
        );
        teacherId = inserted[0].id;
        console.log('[seed] Created teacher (id:', teacherId, ')');
      } else {
        teacherId = teacher[0].id;
        console.log('[seed] Teacher already exists (id:', teacherId, ') — skipping');
      }

      // Ensure teacher role row exists
      const teacherRole = await em.query<{ id: string }[]>(
        `SELECT id FROM user_roles WHERE user_id = $1 AND role = $2 LIMIT 1`,
        [teacherId, UserRoleType.TEACHER],
      );
      if (teacherRole.length === 0) {
        await em.query(
          `INSERT INTO user_roles (id, user_id, role)
           VALUES (gen_random_uuid(), $1, $2)`,
          [teacherId, UserRoleType.TEACHER],
        );
        console.log('[seed] Created TEACHER role for teacher');
      }

      // ──────────────────────────────────────────────────────────────────────
      // 2. Students (6 total, registries 0002–0007)
      // ──────────────────────────────────────────────────────────────────────
      const studentSeeds: Array<{
        registry: string;
        name: string;
        belt: Belt;
      }> = [
        { registry: '0002', name: 'Lucas Oliveira', belt: Belt.WHITE },
        { registry: '0003', name: 'Fernanda Costa', belt: Belt.BLUE },
        { registry: '0004', name: 'Rafael Souza', belt: Belt.YELLOW },
        { registry: '0005', name: 'Ana Lima', belt: Belt.WHITE },
        { registry: '0006', name: 'Carlos Mendes', belt: Belt.GREEN },
        { registry: '0007', name: 'Beatriz Santos', belt: Belt.ORANGE },
      ];

      const studentIds: string[] = [];

      for (const s of studentSeeds) {
        const existing = await em.query<{ id: string }[]>(
          `SELECT id FROM users WHERE registry = $1 AND deleted_at IS NULL LIMIT 1`,
          [s.registry],
        );

        let studentId: string;
        if (existing.length === 0) {
          const studentPw = await bcrypt.hash(`Student@${s.registry}`, SEED_BCRYPT_ROUNDS);
          const ins = await em.query<{ id: string }[]>(
            `INSERT INTO users (id, name, registry, password, belt, instructor_id, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now(), now())
             RETURNING id`,
            [s.name, s.registry, studentPw, s.belt, teacherId],
          );
          studentId = ins[0].id;
          console.log(`[seed] Created student ${s.name} (id: ${studentId})`);
        } else {
          studentId = existing[0].id;
          console.log(`[seed] Student ${s.name} already exists — skipping`);
        }

        // Ensure student role row
        const sRole = await em.query<{ id: string }[]>(
          `SELECT id FROM user_roles WHERE user_id = $1 AND role = $2 LIMIT 1`,
          [studentId, UserRoleType.STUDENT],
        );
        if (sRole.length === 0) {
          await em.query(
            `INSERT INTO user_roles (id, user_id, role)
             VALUES (gen_random_uuid(), $1, $2)`,
            [studentId, UserRoleType.STUDENT],
          );
        }

        studentIds.push(studentId);
      }

      // ──────────────────────────────────────────────────────────────────────
      // 3. Class
      // ──────────────────────────────────────────────────────────────────────
      const existingClass = await em.query<{ id: string }[]>(
        `SELECT id FROM classes WHERE name = $1 AND teacher_id = $2 AND deleted_at IS NULL LIMIT 1`,
        ['Fundamentos do BJJ', teacherId],
      );

      let classId: string;
      if (existingClass.length === 0) {
        const ins = await em.query<{ id: string }[]>(
          `INSERT INTO classes
             (id, name, days, start_time, duration_minutes, belt, teacher_id, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now(), now())
           RETURNING id`,
          [
            'Fundamentos do BJJ',
            ['monday', 'wednesday', 'friday'],
            '07:00',
            60,
            Belt.WHITE,
            teacherId,
          ],
        );
        classId = ins[0].id;
        console.log('[seed] Created class (id:', classId, ')');
      } else {
        classId = existingClass[0].id;
        console.log('[seed] Class already exists (id:', classId, ') — skipping');
      }

      // Enroll all students in the class
      for (const sid of studentIds) {
        const enrolled = await em.query<{ id: string }[]>(
          `SELECT id FROM class_enrollments WHERE class_id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
          [classId, sid],
        );
        if (enrolled.length === 0) {
          await em.query(
            `INSERT INTO class_enrollments (id, class_id, user_id, created_at)
             VALUES (gen_random_uuid(), $1, $2, now())`,
            [classId, sid],
          );
        }
      }
      console.log('[seed] Enrolled', studentIds.length, 'students in class');

      // ──────────────────────────────────────────────────────────────────────
      // 4. Sessions (yesterday, today, tomorrow)
      // ──────────────────────────────────────────────────────────────────────
      const today = new Date();
      const dates = [-1, 0, 1].map((offset) => {
        const d = new Date(today);
        d.setDate(d.getDate() + offset);
        return d.toISOString().slice(0, 10); // YYYY-MM-DD
      });

      for (const date of dates) {
        const existingSession = await em.query<{ id: string }[]>(
          `SELECT id FROM class_sessions WHERE class_id = $1 AND date = $2 AND deleted_at IS NULL LIMIT 1`,
          [classId, date],
        );
        if (existingSession.length === 0) {
          await em.query(
            `INSERT INTO class_sessions (id, class_id, date, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, now(), now())`,
            [classId, date],
          );
          console.log('[seed] Created session for date:', date);
        } else {
          console.log('[seed] Session for date', date, 'already exists — skipping');
        }
      }
    });

    console.log('[seed] Done. All seeders completed successfully.');
  } finally {
    await ds.destroy();
  }
}

seed().catch((err: unknown) => {
  console.error('[seed] Fatal error:', err);
  process.exit(1);
});
