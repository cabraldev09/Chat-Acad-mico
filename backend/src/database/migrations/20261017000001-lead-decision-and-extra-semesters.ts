import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Leads", "decisionTimeline", { type: DataTypes.STRING, allowNull: true });
    await queryInterface.addColumn("Leads", "motivation", { type: DataTypes.STRING, allowNull: true });
    // extra semesters beyond the curriculum (adaptations, dependencies) a transfer may need
    await queryInterface.addColumn("Leads", "extraSemesters", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Leads", "extraSemesters");
    await queryInterface.removeColumn("Leads", "motivation");
    await queryInterface.removeColumn("Leads", "decisionTimeline");
  }
};
