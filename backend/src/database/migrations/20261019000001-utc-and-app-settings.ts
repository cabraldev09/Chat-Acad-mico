import { QueryInterface, QueryTypes } from "sequelize";

// Until now MariaDB stored wall-clock time at UTC-3. From now on every instant is
// stored in UTC (the Postgres/Supabase way) and shown in the company timezone.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const sequelize: any = queryInterface.sequelize;
    if (sequelize.getDialect() === "mysql") {
      const cols: any[] = await sequelize.query(
        `SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND DATA_TYPE IN ('datetime','timestamp')
           AND TABLE_NAME <> 'SequelizeMeta'`,
        { type: QueryTypes.SELECT }
      );
      for (const { t, c } of cols) {
        // eslint-disable-next-line no-await-in-loop
        await sequelize.query(
          `UPDATE \`${t}\` SET \`${c}\` = DATE_ADD(\`${c}\`, INTERVAL 3 HOUR) WHERE \`${c}\` IS NOT NULL`
        );
      }
    }
    await queryInterface.bulkInsert("Settings", [
      { key: "appTimezone", value: "America/Porto_Velho", createdAt: new Date(), updatedAt: new Date() }
    ]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.bulkDelete("Settings", { key: "appTimezone" });
  }
};
