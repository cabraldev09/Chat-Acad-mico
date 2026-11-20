import { QueryInterface } from "sequelize";

// the Painel do CRM and the statistics read the leads by date, by stage and by owner: indexes so they stay fast with many leads
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addIndex("Leads", ["createdAt"], { name: "leads_created_at" }).catch(() => undefined);
    await queryInterface.addIndex("Leads", ["stageId", "isHistorical"], { name: "leads_stage_historical" }).catch(() => undefined);
    await queryInterface.addIndex("Leads", ["ownerId"], { name: "leads_owner" }).catch(() => undefined);
    await queryInterface.addIndex("Leads", ["wonAt"], { name: "leads_won_at" }).catch(() => undefined);
  },
  down: async (queryInterface: QueryInterface) => {
    for (const name of ["leads_created_at", "leads_stage_historical", "leads_owner", "leads_won_at"]) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.removeIndex("Leads", name).catch(() => undefined);
    }
  }
};
