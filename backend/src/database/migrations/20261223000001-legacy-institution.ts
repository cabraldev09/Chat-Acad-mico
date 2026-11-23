import { QueryInterface } from "sequelize";

// NULL institutionId on rows that existed before university assignment means the university that was then the default. Pin it once
// so later default changes do not relabel the historical conversations, leads, campaigns, or agents.
module.exports = {
  up: async (q: QueryInterface) => {
    await q.sequelize.transaction(async transaction => {
      // The previous deploy may have allowed the operator to change the default before this pin was added. Recover the migration-time
      // choice by the same priority used by the institutions migration: global name, catalogue owner, then first active. Do not use the
      // current default as an earlier fallback: it may already have changed since that migration.
      const [[setting]]: any = await q.sequelize.query(`SELECT value FROM "Settings" WHERE key = 'institution_name'`, { transaction });
      const name = String(setting?.value || "Cruzeiro do Sul Virtual");
      const [[byName]]: any = await q.sequelize.query(`SELECT id FROM "Institutions" WHERE active = true AND LOWER(name) = LOWER(:name) ORDER BY id LIMIT 1`, { transaction, replacements: { name } });
      const [[holding]]: any = await q.sequelize.query(`SELECT id FROM "Institutions" WHERE active = true AND POSITION(LOWER(:name) IN LOWER(name)) > 0 ORDER BY LENGTH(name), id LIMIT 1`, { transaction, replacements: { name } });
      const [[catalogue]]: any = await q.sequelize.query(`SELECT i.id FROM "Institutions" i JOIN "Courses" c ON c."institutionId" = i.id WHERE i.active = true GROUP BY i.id ORDER BY COUNT(*) DESC, i.id LIMIT 1`, { transaction });
      const [[first]]: any = await q.sequelize.query(`SELECT id FROM "Institutions" WHERE active = true ORDER BY id LIMIT 1`, { transaction });
      const row = byName || holding || catalogue || first;
      if (!row?.id) throw new Error("legacy institution migration requires a default institution");
      await q.sequelize.query(
        `INSERT INTO "Settings" (key, value, "createdAt", "updatedAt") VALUES ('legacy_institution_id', :id, NOW(), NOW()) ON CONFLICT (key) DO NOTHING`,
        { transaction, replacements: { id: String(row.id) } }
      );
    });
  },
  down: async (q: QueryInterface) => {
    await q.sequelize.transaction(async transaction => {
      await q.sequelize.query(`DELETE FROM "Settings" WHERE key = 'legacy_institution_id'`, { transaction });
    });
  }
};
