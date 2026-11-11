import { QueryInterface, DataTypes } from "sequelize";
module.exports = {
  up: async (q: QueryInterface) => q.sequelize.transaction(async transaction => {
    const o = { transaction };
    const fk = (model: string, nullable = false) => ({ type: DataTypes.INTEGER, allowNull: nullable, references: { model, key: "id" }, onDelete: nullable ? "SET NULL" : "CASCADE" });
    await q.createTable("CopilotRequests", {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: fk("Users"), whatsappId: fk("Whatsapps"), ticketId: fk("Tickets"),
      contextKey: { type: DataTypes.STRING(64), allowNull: false }, configVersion: { type: DataTypes.INTEGER, allowNull: false },
      status: { type: DataTypes.STRING(20), allowNull: false }, text: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false }, updatedAt: { type: DataTypes.DATE, allowNull: false }
    }, o);
    await q.addIndex("CopilotRequests", ["createdAt"], { ...o, name: "copilot_requests_daily" });
    await q.addIndex("CopilotRequests", ["userId", "createdAt"], { ...o, name: "copilot_requests_user_day" });
    await q.addIndex("CopilotRequests", ["whatsappId", "createdAt"], { ...o, name: "copilot_requests_connection_day" });
    await q.addIndex("CopilotRequests", ["ticketId", "contextKey", "configVersion"], { ...o, unique: true, name: "copilot_requests_message_version" });
    await q.createTable("CopilotProgress", {
      ticketId: { ...fk("Tickets"), primaryKey: true }, overrides: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      updatedBy: fk("Users", true), createdAt: { type: DataTypes.DATE, allowNull: false }, updatedAt: { type: DataTypes.DATE, allowNull: false }
    }, o);
    for (const table of ["CopilotRequests", "CopilotProgress"]) await q.sequelize.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`, o);
  }),
  down: async (q: QueryInterface) => q.sequelize.transaction(async transaction => {
    await q.dropTable("CopilotProgress", { transaction });
    await q.dropTable("CopilotRequests", { transaction });
  })
};
