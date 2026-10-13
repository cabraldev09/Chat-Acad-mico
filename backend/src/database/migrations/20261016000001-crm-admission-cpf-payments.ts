import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Leads", "cpf", { type: DataTypes.STRING(11), allowNull: true });
    await queryInterface.addIndex("Leads", ["cpf"]);
    await queryInterface.addColumn("Leads", "admissionType", { type: DataTypes.STRING, allowNull: true });
    await queryInterface.addColumn("Leads", "entrySemester", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    });

    await queryInterface.createTable("Payments", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      provider: { type: DataTypes.STRING, allowNull: false, defaultValue: "efi" },
      kind: { type: DataTypes.STRING, allowNull: false, defaultValue: "matricula" },
      txid: { type: DataTypes.STRING, allowNull: false, unique: true },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      // pending | paid | cancelled | expired
      status: { type: DataTypes.STRING, allowNull: false, defaultValue: "pending" },
      description: { type: DataTypes.STRING, allowNull: true },
      pixCopiaECola: { type: DataTypes.TEXT, allowNull: true },
      qrImage: { type: DataTypes.TEXT({ length: "long" }), allowNull: true },
      locationUrl: { type: DataTypes.TEXT, allowNull: true },
      expiresAt: { type: DataTypes.DATE, allowNull: true },
      paidAt: { type: DataTypes.DATE, allowNull: true },
      paidAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      endToEndId: { type: DataTypes.STRING, allowNull: true },
      lastError: { type: DataTypes.TEXT, allowNull: true },
      leadId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Leads", key: "id" },
        onDelete: "CASCADE"
      },
      proposalId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Proposals", key: "id" },
        onDelete: "SET NULL"
      },
      createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onDelete: "SET NULL"
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await queryInterface.addIndex("Payments", ["leadId"]);
    await queryInterface.addIndex("Payments", ["status"]);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("Payments");
    await queryInterface.removeColumn("Leads", "entrySemester");
    await queryInterface.removeColumn("Leads", "admissionType");
    await queryInterface.removeColumn("Leads", "cpf");
  }
};
