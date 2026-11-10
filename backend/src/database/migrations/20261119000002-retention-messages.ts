import { QueryInterface, DataTypes } from "sequelize";

// RetentionMessages: every message the retention area sends to a student (the satisfaction survey, the message to a student at
// risk, the re-enrollment notice, a message chosen by hand): what was written, to whom, by whom (a person or the system) and
// whether it reached WhatsApp. It feeds the "Envios" log and the numbers of the operation.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("RetentionMessages", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      // null when the person is not in the CRM (a number from a list, a contact): then `name` and `number` tell who it was
      leadId: { type: DataTypes.INTEGER, allowNull: true, references: { model: "Leads", key: "id" }, onUpdate: "CASCADE", onDelete: "SET NULL" },
      contactId: { type: DataTypes.INTEGER, allowNull: true },
      name: { type: DataTypes.STRING(160), allowNull: true },
      number: { type: DataTypes.STRING(40), allowNull: true },
      // nps | risk | remat | custom
      kind: { type: DataTypes.STRING(10), allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      // the survey this message opened, when it is one
      surveyId: { type: DataTypes.INTEGER, allowNull: true },
      // who sent it: a person, or null when the system did it by itself
      userId: { type: DataTypes.INTEGER, allowNull: true },
      // sent | failed
      status: { type: DataTypes.STRING(8), allowNull: false, defaultValue: "sent" },
      error: { type: DataTypes.TEXT, allowNull: true },
      // buttons were used (official API) or the student answers by typing
      withButtons: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("RetentionMessages", ["createdAt"]);
    await queryInterface.addIndex("RetentionMessages", ["leadId", "kind"]);
    // the exact score is asked in a second step after the student chooses the group (promoter / neutral / detractor)
    await queryInterface.addColumn("NpsSurveys", "scoreGroup", { type: DataTypes.STRING(10), allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("NpsSurveys", "scoreGroup");
    await queryInterface.dropTable("RetentionMessages");
  }
};
