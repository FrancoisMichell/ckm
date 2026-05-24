import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `class_sessions` table.
 *
 * Named constraints for QueryFailedErrorFilter:
 *   fk_class_sessions_class  — FK class_sessions.class_id → classes.id RESTRICT
 *
 * Partial unique index `uq_class_sessions_class_date_active` prevents two
 * active sessions for the same (class_id, date) while allowing soft-deleted
 * sessions to share the same pair (enabling restore or re-create after delete).
 *
 * QueryFailedErrorFilter constraint key: `uq_class_sessions_class_date_active`
 */
export class CreateClassSessions1700000000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "class_sessions" (
        "id"         UUID          NOT NULL DEFAULT uuid_generate_v4(),
        "class_id"   UUID          NOT NULL,
        "date"       DATE          NOT NULL,
        "start_time" TIMESTAMPTZ   NULL,
        "end_time"   TIMESTAMPTZ   NULL,
        "notes"      VARCHAR(500)  NULL,
        "created_at" TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ   NULL,
        CONSTRAINT "pk_class_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_class_sessions_class"
          FOREIGN KEY ("class_id") REFERENCES "classes" ("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    // Partial unique: one active session per (class, date).
    // Soft-deleted rows are exempt so restore / re-create is possible.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_class_sessions_class_date_active"
        ON "class_sessions" ("class_id", "date")
        WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_class_sessions_class_id" ON "class_sessions" ("class_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_class_sessions_date" ON "class_sessions" ("date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_class_sessions_deleted_at" ON "class_sessions" ("deleted_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_class_sessions_deleted_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_class_sessions_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_class_sessions_class_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_class_sessions_class_date_active"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "class_sessions"`);
  }
}
