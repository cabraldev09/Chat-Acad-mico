import { createHash } from "crypto";
import { QueryInterface, QueryTypes } from "sequelize";

// The tokens saved in plain text become a SHA-256 hash (the token itself is erased). They keep full access (["*"]) and no expiry, marked
// as legacy, so no integration that uses them stops. Runs again without harm: only rows that still have a plain token change.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const db = queryInterface.sequelize;
    const rows = (await db.query(`SELECT id, token FROM "ApiTokens" WHERE token IS NOT NULL`, { type: QueryTypes.SELECT })) as Array<{ id: number; token: string }>;
    for (const r of rows) {
      const hash = createHash("sha256").update(String(r.token)).digest("hex");
      // eslint-disable-next-line no-await-in-loop
      await db.query(
        `UPDATE "ApiTokens" SET "tokenHash" = :hash, "tokenPrefix" = :prefix, scopes = '["*"]', legacy = true, token = NULL, "updatedAt" = NOW() WHERE id = :id`,
        { replacements: { hash, prefix: String(r.token).slice(0, 9), id: r.id } }
      );
    }
  },
  down: async () => undefined
};
