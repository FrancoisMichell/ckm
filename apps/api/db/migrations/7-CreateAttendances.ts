import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `attendances` table.
 *
 * Named constraints for QueryFailedErrorFilter:
 *   fk_attendances_session  — FK attendances.session_id → class_sessions(id) ON DELETE CASCADE
 *   fk_attendances_student  — FK attendances.student_id → users(id) ON DELETE CASCADE
 *
 * Partial unique index `uq_attendances_session_student_active` prevents two
 * active attendance rows for the same (session_id, student_id) while allowing
 * soft-deleted rows to coexist (enables re-create after soft-delete).
 *
 * `is_enrolled_class` is an AUDIT SNAPSHOT set once at insert time and never
 * recomputed on read. The default `false` is intentional: callers must set
 * the correct value explicitly at insert time.
 *
 * QueryFailedErrorFilter constraint keys:
 *   uq_attendances_session_student_active
 *   fk_attendances_session
 *   fk_attendances_student
 */
export class CreateAttendances1700000000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "attendances" (
        "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
        "session_id"       UUID          NOT NULL,
        "student_id"       UUID          NOT NULL,
        "status"           VARCHAR       NOT NULL DEFAULT 'pending',
        "is_enrolled_class" BOOLEAN      NOT NULL DEFAULT false,
        "checked_in_at"    TIMESTAMPTZ   NULL,
        "notes"            VARCHAR(500)  NULL,
        "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMPTZ   NULL,
        CONSTRAINT "pk_attendances" PRIMARY KEY ("id"),
        CONSTRAINT "fk_attendances_session"
          FOREIGN KEY ("session_id") REFERENCES "class_sessions" ("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "fk_attendances_student"
          FOREIGN KEY ("student_id") REFERENCES "users" ("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    // Partial unique: one active attendance row per (session, student).
    // Soft-deleted rows are exempt so restore / re-create is possible.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_attendances_session_student_active"
        ON "attendances" ("session_id", "student_id")
        WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_attendances_session_id" ON "attendances" ("session_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_attendances_student_id" ON "attendances" ("student_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_attendances_deleted_at" ON "attendances" ("deleted_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_attendances_deleted_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_attendances_student_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_attendances_session_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_attendances_session_student_active"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "attendances"`);
  }
}
