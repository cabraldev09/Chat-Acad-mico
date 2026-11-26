import { QueryInterface, DataTypes } from "sequelize";

// The report of the last full copy of a QR Code number: how many chats the phone had, how many came, and why the others did not (empty,
// failed). Shown in Conexões so the person knows if everything came ("Trazidas 312 de 312 conversas do celular").
module.exports = {
  up: async (q: QueryInterface) => {
    const cols = await q.describeTable("Whatsapps");
    if (!(cols as any).historyReport) await q.addColumn("Whatsapps", "historyReport", { type: DataTypes.TEXT, allowNull: true });
  },
  down: async (q: QueryInterface) => {
    await q.removeColumn("Whatsapps", "historyReport");
  }
};
