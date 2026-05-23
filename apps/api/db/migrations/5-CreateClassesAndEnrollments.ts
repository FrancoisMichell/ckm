import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `classes` and `class_enrollments` tables.
 *
 * Named constraints for QueryFailedErrorFilter:
 *   fk_classes_teacher_id        — FK classes.teacher_id → users.id
 *   fk_classes_created_by        — FK classes.created_by_id → users.id
 *   fk_classes_updated_by        — FK classes.updated_by_id → users.id
 *   chk_classes_duration         — CHECK duration_minutes BETWEEN 30 AND 300
 *   fk_class_enrollments_class   — FK class_enrollments.class_id → classes.id
 *   fk_class_enrollments_user    — FK class_enrollments.user_id → users.id
 *
 * Partial unique on class_enrollments prevents re-enrolling an active student
 * while allowing restore of a soft-deleted enrollment.
 */
export class CreateClassesAndEnrollments1700000000005
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create day_of_week enum (0 = Sunday … 6 = Saturday, stored as text values)
    await queryRunner.query(`
      CREATE TYPE "day_of_week_enum" AS ENUM (
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday'
      )
    `);

    // Create classes table
    await queryRunner.query(`
      CREATE TABLE "classes" (
        "id"               UUID          NOT NULL DEFAULT uuid_generate_v4(),
        "name"             VARCHAR(120)  NOT NULL,
        "days"             TEXT[]        NOT NULL DEFAULT '{}',
        "start_time"       VARCHAR(5)    NOT NULL,
        "duration_minutes" INTEGER       NOT NULL,
        "belt"             "belt_enum"   NOT NULL DEFAULT 'white',
        "teacher_id"       UUID          NOT NULL,
        "created_by_id"    UUID          NULL,
        "updated_by_id"    UUID          NULL,
        "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMPTZ   NULL,
        CONSTRAINT "pk_classes"               PRIMARY KEY ("id"),
        CONSTRAINT "chk_classes_duration"     CHECK ("duration_minutes" BETWEEN 30 AND 300),
        CONSTRAINT "fk_classes_teacher_id"    FOREIGN KEY ("teacher_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_classes_created_by"    FOREIGN KEY ("created_by_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "fk_classes_updated_by"    FOREIGN KEY ("updated_by_id")
          REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_classes_teacher_id" ON "classes" ("teacher_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_classes_deleted_at" ON "classes" ("deleted_at")`,
    );

    // Create class_enrollments table (join of class ↔ student, with soft-delete)
    await queryRunner.query(`
      CREATE TABLE "class_enrollments" (
        "id"         UUID         NOT NULL DEFAULT uuid_generate_v4(),
        "class_id"   UUID         NOT NULL,
        "user_id"    UUID         NOT NULL,
        "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ  NULL,
        CONSTRAINT "pk_class_enrollments" PRIMARY KEY ("id"),
        CONSTRAINT "fk_class_enrollments_class"
          FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "fk_class_enrollments_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    // Partial unique: one active enrollment per (class, student).
    // Soft-deleted rows are exempt so a restore is possible.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_class_enrollments_active"
        ON "class_enrollments" ("class_id", "user_id")
        WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_class_enrollments_class_id" ON "class_enrollments" ("class_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_class_enrollments_user_id" ON "class_enrollments" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_class_enrollments_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_class_enrollments_class_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_class_enrollments_active"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "class_enrollments"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_classes_deleted_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_classes_teacher_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "classes"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "day_of_week_enum"`);
  }
}
