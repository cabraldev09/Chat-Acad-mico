import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // each consultant's Efí account identifier ("payee code"): the fee is routed to it
    await queryInterface.addColumn("Users", "efiPayeeCode", { type: DataTypes.STRING, allowNull: true });

    await queryInterface.addColumn("Payments", "method", { type: DataTypes.STRING, allowNull: false, defaultValue: "pix" }); // pix | bolix
    await queryInterface.addColumn("Payments", "chargeId", { type: DataTypes.STRING, allowNull: true }); // Efí Cobranças charge_id
    await queryInterface.addColumn("Payments", "dueDate", { type: DataTypes.DATEONLY, allowNull: true });
    await queryInterface.addColumn("Payments", "generateAt", { type: DataTypes.DATE(6), allowNull: true }); // scheduled charges
    await queryInterface.addColumn("Payments", "barcode", { type: DataTypes.TEXT, allowNull: true });
    await queryInterface.addColumn("Payments", "billetLink", { type: DataTypes.TEXT, allowNull: true });
    await queryInterface.addColumn("Payments", "pdfLink", { type: DataTypes.TEXT, allowNull: true });
    await queryInterface.addColumn("Payments", "recipientUserId", { type: DataTypes.INTEGER, allowNull: true });
    await queryInterface.addColumn("Payments", "recipientCode", { type: DataTypes.STRING, allowNull: true });
    await queryInterface.addColumn("Payments", "splitPct", { type: DataTypes.INTEGER, allowNull: true });
    await queryInterface.addColumn("Payments", "reminderTaskId", { type: DataTypes.INTEGER, allowNull: true });
  },
  down: async (queryInterface: QueryInterface) => {
    for (const c of ["reminderTaskId", "splitPct", "recipientCode", "recipientUserId", "pdfLink", "billetLink", "barcode", "generateAt", "dueDate", "chargeId", "method"]) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.removeColumn("Payments", c);
    }
    await queryInterface.removeColumn("Users", "efiPayeeCode");
  }
};
