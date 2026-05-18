import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersAndRoles1700000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure uuid-ossp extension is available
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Create belt enum type
    await queryRunner.query(`
      CREATE TYPE "belt_enum" AS ENUM (
        'white',
        'yellow',
        'orange',
        'green',
        'blue',
        'brown',
        'black'
      )
    `);

    // Create user_role_type enum type
    await queryRunner.query(`
      CREATE TYPE "user_role_type_enum" AS ENUM (
        'teacher',
        'student'
      )
    `);

    // Create users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"             UUID         NOT NULL DEFAULT uuid_generate_v4(),
        "name"           VARCHAR      NOT NULL,
        "registry"       VARCHAR      NULL,
        "password"       VARCHAR      NULL,
        "belt"           "belt_enum"  NOT NULL DEFAULT 'white',
        "birthday"       DATE         NULL,
        "training_since" DATE         NULL,
        "instructor_id"  UUID         NULL,
        "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "deleted_at"     TIMESTAMPTZ  NULL,
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_registry" UNIQUE ("registry"),
        CONSTRAINT "fk_users_instructor" FOREIGN KEY ("instructor_id")
          REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    // Create indexes on users table
    await queryRunner.query(
      `CREATE INDEX "idx_users_deleted_at" ON "users" ("deleted_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_users_instructor_id" ON "users" ("instructor_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_users_belt" ON "users" ("belt")`,
    );

    // Create user_roles table
    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "id"      UUID                  NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" UUID                  NOT NULL,
        "role"    "user_role_type_enum" NOT NULL,
        CONSTRAINT "pk_user_roles" PRIMARY KEY ("id"),
        CONSTRAINT "uq_user_roles_user_role" UNIQUE ("user_id", "role"),
        CONSTRAINT "fk_user_roles_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop user_roles first (FK dependency on users)
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);

    // Drop indexes on users
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_belt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_instructor_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_deleted_at"`);

    // Drop users table
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE IF EXISTS "user_role_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "belt_enum"`);
  }
}
