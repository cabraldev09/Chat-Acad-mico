import { DataTypes, QueryInterface } from "sequelize";

// A proposal may be made without a lead ("avulsa"): for a colleague to send to a lead of theirs, or a simulation for someone who is
// not in the CRM. It keeps the name of the person it is for.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // only the NOT NULL goes (the link to the lead and its CASCADE stay as they are)
    await queryInterface.sequelize.query(`ALTER TABLE "Proposals" ALTER COLUMN "leadId" DROP NOT NULL`);
    await queryInterface.addColumn("Proposals", "recipientName", { type: DataTypes.STRING(120), allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Proposals", "recipientName");
  }
};
