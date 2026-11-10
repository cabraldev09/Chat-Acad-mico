import { QueryInterface, DataTypes, QueryTypes } from "sequelize";

// The cities each polo serves (a polo served only the city written on it). The city of every existing polo becomes its first coverage.
const key = (s: string): string =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("PoloCoverages", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      poloId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Polos", key: "id" }, onUpdate: "CASCADE", onDelete: "CASCADE" },
      city: { type: DataTypes.STRING, allowNull: false },
      cityKey: { type: DataTypes.STRING, allowNull: false },
      state: { type: DataTypes.STRING(2), allowNull: true },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("PoloCoverages", ["poloId"], { name: "PoloCoverages_poloId" });
    // one city (in one state) belongs to one polo
    await queryInterface.sequelize.query(`CREATE UNIQUE INDEX "PoloCoverages_city_state" ON "PoloCoverages" ("cityKey", COALESCE("state", ''))`);

    const polos: any[] = await queryInterface.sequelize.query(`SELECT id, city, state FROM "Polos" WHERE city IS NOT NULL AND city <> ''`, { type: QueryTypes.SELECT });
    const seen = new Set<string>();
    const now = new Date();
    const rows = polos
      .map(p => ({ poloId: p.id, city: p.city, cityKey: key(p.city), state: p.state || null, createdAt: now, updatedAt: now }))
      .filter(r => r.cityKey && !seen.has(`${r.cityKey}|${r.state || ""}`) && seen.add(`${r.cityKey}|${r.state || ""}`));
    if (rows.length) await queryInterface.bulkInsert("PoloCoverages", rows);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("PoloCoverages");
  }
};
