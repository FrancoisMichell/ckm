import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixUsersRegistryPartialIndex1700000000002
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the plain UNIQUE constraint that blocks registry reuse after soft-delete.
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "uq_users_registry"`,
    );

    // Replace with a partial unique index that only enforces uniqueness among
    // non-deleted rows, allowing the same registry to be assigned to a new user
    // after the original has been soft-deleted.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_users_registry_active"
        ON "users" ("registry")
        WHERE deleted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_users_registry_active"`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "uq_users_registry" UNIQUE ("registry")`,
    );
  }
}
