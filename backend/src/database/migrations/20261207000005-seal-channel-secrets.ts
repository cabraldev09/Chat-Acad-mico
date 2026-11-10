import { QueryInterface, QueryTypes } from "sequelize";

import { sealConfig } from "../../helpers/Secrets";

// The tokens and secrets of the channel connections were stored as plain text: from now on they are stored sealed (a copy of the database alone does not reveal them).
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const sq = queryInterface.sequelize;
    const rows = (await sq.query(`SELECT id, config FROM "Whatsapps" WHERE config IS NOT NULL AND config <> ''`, { type: QueryTypes.SELECT })) as Array<{ id: number; config: string }>;
    for (const row of rows) {
      const sealed = sealConfig(row.config);
      if (sealed && sealed !== row.config) await sq.query(`UPDATE "Whatsapps" SET config = :config WHERE id = :id`, { replacements: { config: sealed, id: row.id } });
    }
  },
  // sealed values are read as before; there is nothing to undo
  down: async () => undefined
};
