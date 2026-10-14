import { QueryInterface, DataTypes } from "sequelize";

// Commissions: the enrollment fee is split by Efí to the consultant's wallet at payment time. When the consultant had no
// wallet registered the money stays with the company and is paid later by hand: these columns record that repayment.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Payments", "commissionSettledAt", { type: DataTypes.DATE(6), allowNull: true });
    await queryInterface.addColumn("Payments", "commissionSettledBy", { type: DataTypes.INTEGER, allowNull: true });
    await queryInterface.addColumn("Payments", "commissionNote", { type: DataTypes.TEXT, allowNull: true });
    await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS "payments_recipient_idx" ON "Payments" ("recipientUserId", "status")`);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "payments_recipient_idx"`);
    for (const c of ["commissionNote", "commissionSettledBy", "commissionSettledAt"]) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.removeColumn("Payments", c);
    }
  }
};
