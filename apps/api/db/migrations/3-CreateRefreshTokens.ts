import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the refresh_tokens table used by the auth rotation system.
 *
 * Design notes:
 * - token_hash stores the bcrypt hash of the opaque token (never plaintext).
 * - lookup_hash stores a SHA-256 hex digest of the raw token for fast O(1) lookup
 *   without bcrypt scanning. bcrypt verify on the found row is still done as a
 *   belt-and-suspenders timing-safe guard.
 * - family_id groups tokens issued through successive rotations. When a consumed
 *   token is replayed, the entire family is revoked.
 * - replaced_by is set to the successor row's id when rotation occurs.
 * - revoked starts false; set to true on consumption, logout, or family revocation.
 */
export class CreateRefreshTokens1700000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
        "user_id"      UUID         NOT NULL,
        "token_hash"   TEXT         NOT NULL,
        "lookup_hash"  TEXT         NOT NULL,
        "family_id"    UUID         NOT NULL,
        "replaced_by"  UUID         NULL,
        "revoked"      BOOLEAN      NOT NULL DEFAULT false,
        "expires_at"   TIMESTAMPTZ  NOT NULL,
        "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "fk_refresh_tokens_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    // Index on family_id for efficient family-revocation queries
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_family_id" ON "refresh_tokens" ("family_id")`,
    );

    // Unique index on lookup_hash so the lookup query is O(1)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_refresh_tokens_lookup_hash" ON "refresh_tokens" ("lookup_hash")`,
    );

    // Partial index for active (non-revoked) tokens — used in rotation checks
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_active" ON "refresh_tokens" ("lookup_hash") WHERE revoked = false`,
    );

    // Index on expires_at for cleanup queries
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_expires_at" ON "refresh_tokens" ("expires_at")`,
    );

    // Index on user_id for per-user token queries
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_refresh_tokens_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_refresh_tokens_expires_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_refresh_tokens_active"`,
    );
    await queryRunner.query(
      `DROP UNIQUE INDEX IF EXISTS "uq_refresh_tokens_lookup_hash"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_refresh_tokens_family_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
  }
}
