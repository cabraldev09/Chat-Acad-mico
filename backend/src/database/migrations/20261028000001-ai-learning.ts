import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // questions the agent could not answer, and what the team answered: the owner reviews before the agent learns
    await queryInterface.createTable("AiLearnings", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      agentId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "AiAgents", key: "id" }, onDelete: "CASCADE" },
      ticketId: { type: DataTypes.INTEGER, allowNull: true },
      contactName: { type: DataTypes.STRING, allowNull: true },
      question: { type: DataTypes.TEXT, allowNull: false },
      // what the team answered (or what the owner typed when teaching directly)
      suggestedAnswer: { type: DataTypes.TEXT, allowNull: true },
      // aguardando_equipe | para_revisar | aprovada | descartada
      status: { type: DataTypes.STRING, allowNull: false, defaultValue: "aguardando_equipe" },
      // equipe | dono
      answerSource: { type: DataTypes.STRING, allowNull: true },
      documentId: { type: DataTypes.INTEGER, allowNull: true },
      reviewedAt: { type: DataTypes.DATE(6), allowNull: true },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("AiLearnings", ["agentId", "status"]);
    await queryInterface.addIndex("AiLearnings", ["ticketId"]);
    // who is told on WhatsApp, and through which connection
    await queryInterface.addColumn("AiAgents", "reviewNumber", { type: DataTypes.STRING, allowNull: true });
    await queryInterface.addColumn("AiAgents", "reviewWhatsappId", { type: DataTypes.INTEGER, allowNull: true });
    await queryInterface.addColumn("AiAgents", "learnFromTeam", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true });
  },
  down: async (queryInterface: QueryInterface) => {
    for (const c of ["learnFromTeam", "reviewWhatsappId", "reviewNumber"]) await queryInterface.removeColumn("AiAgents", c);
    await queryInterface.dropTable("AiLearnings");
  }
};
