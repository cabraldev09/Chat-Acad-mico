import { QueryInterface, DataTypes } from "sequelize";

// The relationship department: a queue for the whole institution (the conversations on the institution's own number: the
// satisfaction survey and the after-sales messages) and the connection each survey / message went out from, so the answers and
// the limits are read per connection.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("NpsSurveys", "whatsappId", { type: DataTypes.INTEGER, allowNull: true });
    await queryInterface.addColumn("RetentionMessages", "whatsappId", { type: DataTypes.INTEGER, allowNull: true });
    await queryInterface.addIndex("RetentionMessages", ["whatsappId", "createdAt"]);
    const [rows] = (await queryInterface.sequelize.query(`SELECT id FROM "Queues" WHERE role = 'relacionamento' LIMIT 1`)) as any;
    if (!rows.length) {
      const [taken] = (await queryInterface.sequelize.query(`SELECT color FROM "Queues"`)) as any;
      const used = new Set((taken as Array<{ color: string }>).map(q => q.color));
      const color = ["#7C3AED", "#8B5CF6", "#6D28D9", "#A855F7", "#9333EA"].find(c => !used.has(c)) || "#7E22CE";
      await queryInterface.sequelize.query(
        `INSERT INTO "Queues" (name, color, "autoAssign", role, "createdAt", "updatedAt")
         SELECT 'Relacionamento', :color, 'roundrobin', 'relacionamento', now(), now()
          WHERE NOT EXISTS (SELECT 1 FROM "Queues" WHERE name = 'Relacionamento')`,
        { replacements: { color } } as any
      );
      // a queue that already had the name (made by hand) becomes the department's queue
      await queryInterface.sequelize.query(`UPDATE "Queues" SET role = 'relacionamento' WHERE name = 'Relacionamento' AND role IS NULL`);
    }
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeIndex("RetentionMessages", ["whatsappId", "createdAt"]);
    await queryInterface.removeColumn("RetentionMessages", "whatsappId");
    await queryInterface.removeColumn("NpsSurveys", "whatsappId");
  }
};
