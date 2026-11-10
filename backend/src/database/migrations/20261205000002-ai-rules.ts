import { QueryInterface, DataTypes } from "sequelize";

// What the owner taught the agent by talking to it (or from a file): fixed rules, examples of a good answer and the way of speaking.
// They enter the prompt of EVERY answer, so the agent follows them to the letter.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("AiRules", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      agentId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "AiAgents", key: "id" }, onDelete: "CASCADE" },
      // regra | exemplo | estilo
      kind: { type: DataTypes.STRING, allowNull: false, defaultValue: "regra" },
      text: { type: DataTypes.TEXT, allowNull: false },
      position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      // treino | arquivo | conversa
      source: { type: DataTypes.STRING, allowNull: false, defaultValue: "treino" },
      createdBy: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE(6), allowNull: false },
      updatedAt: { type: DataTypes.DATE(6), allowNull: false }
    });
    await queryInterface.addIndex("AiRules", ["agentId", "active", "kind"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AiRules");
  }
};
