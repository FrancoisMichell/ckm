import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ports `seirin/db/migrations/1771367382805-addStudentFilterIndexes.ts` into the
 * CKM v2 schema, adapted to the soft-delete model.
 *
 * Adaptations vs. legacy:
 *
 * 1. The legacy migration created `(is_active, name)` on `users`. CKM v2 has no
 *    `is_active` column — soft-delete is expressed via the `deleted_at`
 *    timestamptz (see migration 1). The semantically equivalent index for the
 *    "active students sorted by name" query path is `(deleted_at, name)`.
 *
 * 2. The legacy migration also created `(class_id, user_id)` on
 *    `class_enrollments`. That table does not exist yet in M4 — it lands in
 *    migration 5 (M5: `CreateClassesAndEnrollments`). The composite index will
 *    be created there alongside the table so this migration stays atomic
 *    against the M4 schema. This deviation is documented in M4's session log.
 *
 * Index names preserved (legacy `IDX_…` style swapped for CKM's `idx_…`
 * convention, matching migrations 1–3).
 */
export class AddStudentIndexes1700000000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Composite index supporting the hot path of StudentsController.findAll:
    //   WHERE deleted_at IS NULL ORDER BY name
    // Postgres can satisfy both the soft-delete filter and the name sort from
    // this index without a heap scan when the leading column matches the
    // predicate.
    await queryRunner.query(
      `CREATE INDEX "idx_users_deleted_name" ON "users" ("deleted_at", "name")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_deleted_name"`);
  }
}
