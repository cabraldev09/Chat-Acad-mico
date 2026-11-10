import { QueryInterface, DataTypes } from "sequelize";

// Semipresencial courses are enrolled only at the polos released for it; the other polos send those students to the nearest released one
// (the practical classes in the students' own cities are being made possible). A lead keeps both: the polo where it enrolls and the polo
// of its city.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Polos", "enrollsSemipresencial", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.addColumn("Polos", "enrollPoloId", { type: DataTypes.INTEGER, allowNull: true, references: { model: "Polos", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" });
    await queryInterface.addColumn("Leads", "practicePoloId", { type: DataTypes.INTEGER, allowNull: true, references: { model: "Polos", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Leads", "practicePoloId");
    await queryInterface.removeColumn("Polos", "enrollPoloId");
    await queryInterface.removeColumn("Polos", "enrollsSemipresencial");
  }
};
