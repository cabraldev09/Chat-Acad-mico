import { QueryInterface, DataTypes } from "sequelize";

// One agent on several connections (the same Estela on the QR number and on the Cloud API number), without making a copy of the agent.
// whatsappId stays for what was already set; the list is added to it.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const columns = await queryInterface.describeTable("AiAgents");
    if (!("whatsappIds" in columns)) await queryInterface.addColumn("AiAgents", "whatsappIds", { type: DataTypes.JSON, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    const columns = await queryInterface.describeTable("AiAgents");
    if ("whatsappIds" in columns) await queryInterface.removeColumn("AiAgents", "whatsappIds");
  }
};
